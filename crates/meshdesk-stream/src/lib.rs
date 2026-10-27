use log::{debug, warn};
use meshdesk_core::{MeshDeskError, Result};
use meshdesk_protocol::InputKind;

/// Quality level for JPEG frame compression (1 - 100)
pub const DEFAULT_JPEG_QUALITY: u8 = 75;

pub struct ScreenCaptureEngine {
    quality: u8,
}

impl Default for ScreenCaptureEngine {
    fn default() -> Self {
        Self::new(DEFAULT_JPEG_QUALITY)
    }
}

impl ScreenCaptureEngine {
    pub fn new(quality: u8) -> Self {
        Self {
            quality: quality.clamp(10, 95),
        }
    }

    /// Captures the primary display desktop and returns `(width, height, jpeg_bytes)`
    pub fn capture_frame(&self) -> Result<(u32, u32, Vec<u8>)> {
        #[cfg(windows)]
        {
            self.capture_windows_gdi()
        }

        #[cfg(not(windows))]
        {
            self.capture_fallback_pattern()
        }
    }

    #[cfg(windows)]
    fn capture_windows_gdi(&self) -> Result<(u32, u32, Vec<u8>)> {
        use windows_sys::Win32::Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, SRCCOPY,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
        };

        unsafe {
            let width = GetSystemMetrics(SM_CXSCREEN) as u32;
            let height = GetSystemMetrics(SM_CYSCREEN) as u32;

            if width == 0 || height == 0 {
                return Err(MeshDeskError::SessionError(
                    "Invalid screen dimensions detected".into(),
                ));
            }

            let hdc_screen = GetDC(std::ptr::null_mut());
            if hdc_screen.is_null() {
                return Err(MeshDeskError::SessionError(
                    "Failed to obtain screen DC".into(),
                ));
            }

            let hdc_mem = CreateCompatibleDC(hdc_screen);
            if hdc_mem.is_null() {
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err(MeshDeskError::SessionError(
                    "Failed to create compatible memory DC".into(),
                ));
            }

            let h_bitmap = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
            if h_bitmap.is_null() {
                DeleteDC(hdc_mem);
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err(MeshDeskError::SessionError(
                    "Failed to allocate compatible bitmap".into(),
                ));
            }

            let old_obj = SelectObject(hdc_mem, h_bitmap);
            let blt_res = BitBlt(
                hdc_mem,
                0,
                0,
                width as i32,
                height as i32,
                hdc_screen,
                0,
                0,
                SRCCOPY,
            );

            if blt_res == 0 {
                SelectObject(hdc_mem, old_obj);
                DeleteObject(h_bitmap);
                DeleteDC(hdc_mem);
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err(MeshDeskError::SessionError(
                    "BitBlt screen capture failed".into(),
                ));
            }

            // Prepare BITMAPINFOHEADER with negative biHeight for top-down rows
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width as i32,
                    biHeight: -(height as i32), // Top-down
                    biPlanes: 1,
                    biBitCount: 32, // BGRA 32-bit
                    biCompression: BI_RGB,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [windows_sys::Win32::Graphics::Gdi::RGBQUAD {
                    rgbBlue: 0,
                    rgbGreen: 0,
                    rgbRed: 0,
                    rgbReserved: 0,
                }; 1],
            };

            let pixel_count = (width * height) as usize;
            let mut bgra_buf = vec![0u8; pixel_count * 4];

            let di_res = GetDIBits(
                hdc_mem,
                h_bitmap,
                0,
                height,
                bgra_buf.as_mut_ptr() as *mut _,
                &mut bmi,
                DIB_RGB_COLORS,
            );

            // Cleanup Win32 GDI resources promptly
            SelectObject(hdc_mem, old_obj);
            DeleteObject(h_bitmap);
            DeleteDC(hdc_mem);
            ReleaseDC(std::ptr::null_mut(), hdc_screen);

            if di_res == 0 {
                return Err(MeshDeskError::SessionError(
                    "GetDIBits pixel extraction failed".into(),
                ));
            }

            // Convert BGRA to RGB for JPEG encoding
            let mut rgb_buf = Vec::with_capacity(pixel_count * 3);
            #[allow(clippy::chunks_exact_to_as_chunks)]
            for pixel in bgra_buf.chunks_exact(4) {
                rgb_buf.push(pixel[2]); // R
                rgb_buf.push(pixel[1]); // G
                rgb_buf.push(pixel[0]); // B
            }

            // Encode to JPEG
            let mut jpeg_bytes = Vec::with_capacity(pixel_count / 10);
            let encoder = jpeg_encoder::Encoder::new(&mut jpeg_bytes, self.quality);
            encoder
                .encode(
                    &rgb_buf,
                    width as u16,
                    height as u16,
                    jpeg_encoder::ColorType::Rgb,
                )
                .map_err(|e| {
                    MeshDeskError::SessionError(format!("JPEG compression failed: {e}"))
                })?;

            Ok((width, height, jpeg_bytes))
        }
    }

    /// Fallback generator for test pattern when running headlessly or outside active desktop
    pub fn capture_fallback_pattern(&self) -> Result<(u32, u32, Vec<u8>)> {
        let width = 1280u32;
        let height = 720u32;
        let mut rgb_buf = Vec::with_capacity((width * height * 3) as usize);

        for y in 0..height {
            for x in 0..width {
                let r = ((x * 255) / width) as u8;
                let g = ((y * 255) / height) as u8;
                let b = 180u8;
                rgb_buf.push(r);
                rgb_buf.push(g);
                rgb_buf.push(b);
            }
        }

        let mut jpeg_bytes = Vec::new();
        let encoder = jpeg_encoder::Encoder::new(&mut jpeg_bytes, self.quality);
        encoder
            .encode(
                &rgb_buf,
                width as u16,
                height as u16,
                jpeg_encoder::ColorType::Rgb,
            )
            .map_err(|e| {
                MeshDeskError::SessionError(format!("Fallback JPEG encoding failed: {e}"))
            })?;

        Ok((width, height, jpeg_bytes))
    }
}

/// Windows Input Injector using `SendInput`
pub struct InputInjector {
    allow_remote_control: bool,
}

impl InputInjector {
    pub fn new(allow_remote_control: bool) -> Self {
        Self {
            allow_remote_control,
        }
    }

    pub fn set_remote_control_allowed(&mut self, allowed: bool) {
        self.allow_remote_control = allowed;
    }

    pub fn inject(&self, event: &InputKind, _screen_w: u32, _screen_h: u32) -> Result<()> {
        if !self.allow_remote_control {
            warn!("Input rejected: remote control consent is disabled on this host.");
            return Ok(());
        }

        #[cfg(windows)]
        {
            self.inject_windows(event)
        }

        #[cfg(not(windows))]
        {
            debug!("Mock input injected: {:?}", event);
            Ok(())
        }
    }

    #[cfg(windows)]
    fn inject_windows(&self, event: &InputKind) -> Result<()> {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_KEYUP,
            MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
            MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
            MOUSEEVENTF_VIRTUALDESK, MOUSEEVENTF_WHEEL, MOUSEINPUT,
        };

        unsafe {
            let mut input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        mouseData: 0,
                        dwFlags: 0,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };

            match event {
                InputKind::MouseMove { x_norm, y_norm } => {
                    input.r#type = INPUT_MOUSE;
                    let abs_x = (x_norm.clamp(0.0, 1.0) * 65535.0) as i32;
                    let abs_y = (y_norm.clamp(0.0, 1.0) * 65535.0) as i32;
                    input.Anonymous.mi = MOUSEINPUT {
                        dx: abs_x,
                        dy: abs_y,
                        mouseData: 0,
                        dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK,
                        time: 0,
                        dwExtraInfo: 0,
                    };
                }
                InputKind::MouseDown { button } => {
                    input.r#type = INPUT_MOUSE;
                    let flags = match button {
                        1 => MOUSEEVENTF_LEFTDOWN,
                        2 => MOUSEEVENTF_RIGHTDOWN,
                        3 => MOUSEEVENTF_MIDDLEDOWN,
                        _ => MOUSEEVENTF_LEFTDOWN,
                    };
                    input.Anonymous.mi.dwFlags = flags;
                }
                InputKind::MouseUp { button } => {
                    input.r#type = INPUT_MOUSE;
                    let flags = match button {
                        1 => MOUSEEVENTF_LEFTUP,
                        2 => MOUSEEVENTF_RIGHTUP,
                        3 => MOUSEEVENTF_MIDDLEUP,
                        _ => MOUSEEVENTF_LEFTUP,
                    };
                    input.Anonymous.mi.dwFlags = flags;
                }
                InputKind::MouseWheel { delta } => {
                    input.r#type = INPUT_MOUSE;
                    input.Anonymous.mi.dwFlags = MOUSEEVENTF_WHEEL;
                    input.Anonymous.mi.mouseData = *delta as u32;
                }
                InputKind::KeyDown { vk, .. } => {
                    input.r#type = INPUT_KEYBOARD;
                    input.Anonymous.ki = KEYBDINPUT {
                        wVk: *vk as u16,
                        wScan: 0,
                        dwFlags: 0,
                        time: 0,
                        dwExtraInfo: 0,
                    };
                }
                InputKind::KeyUp { vk, .. } => {
                    input.r#type = INPUT_KEYBOARD;
                    input.Anonymous.ki = KEYBDINPUT {
                        wVk: *vk as u16,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    };
                }
            }

            let sent = SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
            if sent == 0 {
                debug!("SendInput returned 0 events injected");
            }

            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_fallback_pattern() {
        let engine = ScreenCaptureEngine::new(75);
        let (w, h, bytes) = engine.capture_fallback_pattern().expect("Capture failed");
        assert_eq!(w, 1280);
        assert_eq!(h, 720);
        assert!(!bytes.is_empty());
        // Verify JPEG magic bytes FF D8
        assert_eq!(bytes[0], 0xFF);
        assert_eq!(bytes[1], 0xD8);
    }

    #[test]
    fn test_input_injector_consent_guard() {
        let mut injector = InputInjector::new(false);
        // When consent is false, injection is safely ignored
        let res = injector.inject(
            &InputKind::MouseMove {
                x_norm: 0.5,
                y_norm: 0.5,
            },
            1920,
            1080,
        );
        assert!(res.is_ok());

        injector.set_remote_control_allowed(true);
        let res2 = injector.inject(
            &InputKind::MouseMove {
                x_norm: 0.5,
                y_norm: 0.5,
            },
            1920,
            1080,
        );
        assert!(res2.is_ok());
    }
}

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

        extern "system" {
            fn OpenInputDesktop(
                dwflags: u32,
                finherit: i32,
                dwdesiredaccess: u32,
            ) -> *mut core::ffi::c_void;
            fn SetThreadDesktop(hdesktop: *mut core::ffi::c_void) -> i32;
            fn CloseDesktop(hdesktop: *mut core::ffi::c_void) -> i32;
        }

        unsafe {
            // Attach calling thread to active input desktop so background/tokio worker threads can capture
            let h_desk = OpenInputDesktop(0, 0, 0x01FF);
            if !h_desk.is_null() {
                SetThreadDesktop(h_desk);
                CloseDesktop(h_desk);
            }

            let width = GetSystemMetrics(SM_CXSCREEN) as u32;
            let height = GetSystemMetrics(SM_CYSCREEN) as u32;

            if width == 0 || height == 0 {
                return Err(MeshDeskError::SessionError(
                    "Invalid screen dimensions detected".into(),
                ));
            }

            // Get screen DC for entire primary display
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

            // BitBlt with CAPTUREBLT (0x40000000) captures layered & DWM composited windows
            const CAPTUREBLT: u32 = 0x40000000;
            let mut blt_res = BitBlt(
                hdc_mem,
                0,
                0,
                width as i32,
                height as i32,
                hdc_screen,
                0,
                0,
                SRCCOPY | CAPTUREBLT,
            );

            if blt_res == 0 {
                // Fallback to SRCCOPY if CAPTUREBLT is unsupported or restricted
                blt_res = BitBlt(
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
            }

            // CRITICAL Win32 requirement: deselect h_bitmap from memory DC before calling GetDIBits!
            SelectObject(hdc_mem, old_obj);

            if blt_res == 0 {
                let err = windows_sys::Win32::Foundation::GetLastError();
                DeleteObject(h_bitmap);
                DeleteDC(hdc_mem);
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err(MeshDeskError::SessionError(format!(
                    "BitBlt screen capture failed with Win32 error code: {err}"
                )));
            }

            // Standard bottom-up BITMAPINFOHEADER (positive biHeight) for maximum Windows driver compatibility
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width as i32,
                    biHeight: height as i32,
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
                hdc_screen,
                h_bitmap,
                0,
                height,
                bgra_buf.as_mut_ptr() as *mut _,
                &mut bmi,
                DIB_RGB_COLORS,
            );

            // Cleanup Win32 GDI resources promptly
            DeleteObject(h_bitmap);
            DeleteDC(hdc_mem);
            ReleaseDC(std::ptr::null_mut(), hdc_screen);

            if di_res == 0 {
                return Err(MeshDeskError::SessionError(
                    "GetDIBits pixel extraction failed".into(),
                ));
            }

            // Convert bottom-up BGRA rows into top-down RGB for JPEG encoding
            let stride = (width * 4) as usize;
            let mut rgb_buf = Vec::with_capacity(pixel_count * 3);
            for y in 0..height {
                let row_idx = (height - 1 - y) as usize;
                let row_start = row_idx * stride;
                let row = &bgra_buf[row_start..row_start + stride];
                for pixel in row.chunks_exact(4) {
                    rgb_buf.push(pixel[2]); // R
                    rgb_buf.push(pixel[1]); // G
                    rgb_buf.push(pixel[0]); // B
                }
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

/// Bidirectional clipboard manager for synchronized cross-workstation clipboard (Milestone 5)
pub struct ClipboardManager;

#[cfg(windows)]
impl ClipboardManager {
    pub fn get_text() -> Result<Option<String>> {
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, GetClipboardData, OpenClipboard,
        };
        use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};

        const CF_UNICODETEXT: u32 = 13;

        unsafe {
            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Ok(None);
            }

            let handle = GetClipboardData(CF_UNICODETEXT);
            if handle.is_null() {
                CloseClipboard();
                return Ok(None);
            }

            let ptr = GlobalLock(handle) as *const u16;
            if ptr.is_null() {
                CloseClipboard();
                return Ok(None);
            }

            let mut len = 0;
            while *ptr.add(len) != 0 {
                len += 1;
            }

            let slice = std::slice::from_raw_parts(ptr, len);
            let text = String::from_utf16_lossy(slice);

            GlobalUnlock(handle);
            CloseClipboard();

            Ok(Some(text))
        }
    }

    pub fn set_text(text: &str) -> Result<()> {
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
        };
        use windows_sys::Win32::System::Memory::{
            GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
        };

        const CF_UNICODETEXT: u32 = 13;

        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes_len = wide.len() * std::mem::size_of::<u16>();

        unsafe {
            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Err(MeshDeskError::SessionError("Cannot open clipboard".into()));
            }

            EmptyClipboard();

            let h_mem = GlobalAlloc(GMEM_MOVEABLE, bytes_len);
            if h_mem.is_null() {
                CloseClipboard();
                return Err(MeshDeskError::SessionError(
                    "Cannot allocate memory for clipboard".into(),
                ));
            }

            let ptr = GlobalLock(h_mem) as *mut u16;
            if ptr.is_null() {
                CloseClipboard();
                return Err(MeshDeskError::SessionError(
                    "Cannot lock clipboard memory".into(),
                ));
            }

            std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
            GlobalUnlock(h_mem);

            if SetClipboardData(CF_UNICODETEXT, h_mem).is_null() {
                CloseClipboard();
                return Err(MeshDeskError::SessionError(
                    "Cannot set clipboard data".into(),
                ));
            }

            CloseClipboard();
            Ok(())
        }
    }
}

#[cfg(not(windows))]
impl ClipboardManager {
    pub fn get_text() -> Result<Option<String>> {
        Ok(None)
    }
    pub fn set_text(_text: &str) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_frame_real() {
        // Spawn in a separate thread (mimicking tokio worker thread) to test desktop attachment
        let handle = std::thread::spawn(|| {
            let engine = ScreenCaptureEngine::new(75);
            let res = engine.capture_frame();
            println!(
                "capture_frame result: {:?}",
                res.as_ref().map(|(w, h, b)| (*w, *h, b.len()))
            );
            assert!(res.is_ok());
            let (w, h, bytes) = res.unwrap();
            assert!(w > 0 && h > 0);
            assert!(bytes.len() > 1000);
            // Verify JPEG SOI (FF D8) and EOI (FF D9)
            assert_eq!(bytes[0], 0xFF);
            assert_eq!(bytes[1], 0xD8);
            assert_eq!(bytes[bytes.len() - 2], 0xFF);
            assert_eq!(bytes[bytes.len() - 1], 0xD9);

            // A solid black 1536x864 JPEG is ~8-15KB because of identical zero-entropy DCT blocks.
            // A real desktop with icons, wallpaper, UI elements produces > 30-100KB at Q75.
            println!("Captured JPEG size: {} bytes", bytes.len());
            assert!(
                bytes.len() > 20000,
                "JPEG should contain rich desktop visual data, not solid black"
            );
        });
        handle.join().expect("Worker thread panicked");
    }

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

    #[test]
    fn test_clipboard_set_get_roundtrip() {
        let test_phrase = "MeshDesk Clipboard Sync Test 12345";
        let set_res = ClipboardManager::set_text(test_phrase);
        if set_res.is_ok() {
            let got = ClipboardManager::get_text().unwrap();
            assert_eq!(got, Some(test_phrase.to_string()));
        }
    }
}

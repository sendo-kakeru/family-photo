use image::DynamicImage;

/// EXIF Orientation タグの値
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum Orientation {
    Normal = 1,
    FlipHorizontal = 2,
    Rotate180 = 3,
    FlipVertical = 4,
    Transpose = 5,
    Rotate90 = 6,
    Transverse = 7,
    Rotate270 = 8,
}

impl Orientation {
    /// u16 値から Orientation を作成
    pub fn from_u16(value: u16) -> Option<Self> {
        match value {
            1 => Some(Self::Normal),
            2 => Some(Self::FlipHorizontal),
            3 => Some(Self::Rotate180),
            4 => Some(Self::FlipVertical),
            5 => Some(Self::Transpose),
            6 => Some(Self::Rotate90),
            7 => Some(Self::Transverse),
            8 => Some(Self::Rotate270),
            _ => None,
        }
    }
}

/// EXIF Orientation に基づいて画像を回転・反転させる
pub fn apply_orientation(img: DynamicImage, orientation: Orientation) -> DynamicImage {
    match orientation {
        Orientation::Normal => img,
        Orientation::FlipHorizontal => img.fliph(),
        Orientation::Rotate180 => img.rotate180(),
        Orientation::FlipVertical => img.flipv(),
        Orientation::Transpose => img.rotate90().fliph(),
        Orientation::Rotate90 => img.rotate90(),
        Orientation::Transverse => img.rotate270().fliph(),
        Orientation::Rotate270 => img.rotate270(),
    }
}

/// バイト列から EXIF Orientation タグを読み取る
pub fn read_orientation(data: &[u8]) -> Option<Orientation> {
    let mut cursor = std::io::Cursor::new(data);
    let exif_reader = exif::Reader::new();
    let exif = exif_reader.read_from_container(&mut cursor).ok()?;

    let orientation_field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
    let value = orientation_field.value.get_uint(0)?;

    Orientation::from_u16(value as u16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_orientation_from_u16() {
        assert_eq!(Orientation::from_u16(1), Some(Orientation::Normal));
        assert_eq!(Orientation::from_u16(6), Some(Orientation::Rotate90));
        assert_eq!(Orientation::from_u16(8), Some(Orientation::Rotate270));
        assert_eq!(Orientation::from_u16(9), None);
    }

    #[test]
    fn test_apply_orientation_normal() {
        let img = DynamicImage::new_rgb8(10, 20);
        let result = apply_orientation(img.clone(), Orientation::Normal);
        assert_eq!(result.width(), 10);
        assert_eq!(result.height(), 20);
    }

    #[test]
    fn test_apply_orientation_rotate90() {
        let img = DynamicImage::new_rgb8(10, 20);
        let result = apply_orientation(img, Orientation::Rotate90);
        // 90度回転で幅と高さが入れ替わる
        assert_eq!(result.width(), 20);
        assert_eq!(result.height(), 10);
    }
}

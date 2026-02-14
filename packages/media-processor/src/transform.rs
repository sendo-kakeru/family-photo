use bytes::Bytes;
use image::{DynamicImage, ImageFormat, ImageReader};
use std::io::Cursor;

use media_core::{
    apply_orientation, calculate_contain_dimensions, encode_image, read_orientation, resize_image,
    validate_params, OutputFormat, TransformError, TransformParams, MAX_DIMENSION, MAX_PIXELS,
};

/// 指定されたパラメータに従って画像バイト列を変換する。
///
/// メタデータ (EXIF/XMP) はデコード・エンコードサイクルで削除される。
/// パラメータがなくてもメタデータ削除のために必ずデコード→エンコードを行う。
/// (変換後バイト列, content_type) を返す。
pub fn transform(
    input: &Bytes,
    params: &TransformParams,
) -> Result<(Bytes, &'static str), TransformError> {
    validate_params(params.width, params.height, Some(params.quality))?;

    // 元画像フォーマットを推測するため、ImageReader を使用
    let (img, source_format) = decode_with_format(input)?;

    // EXIF Orientation を読み取って適用
    let orientation = read_orientation(input)
        .unwrap_or(media_core::Orientation::Normal);
    let img = apply_orientation(img, orientation);

    let (src_w, src_h) = (img.width(), img.height());
    validate_source_dimensions(src_w, src_h)?;

    // リサイズが必要な場合
    let resized = if params.width.is_some() || params.height.is_some() {
        let (dst_w, dst_h) = calculate_contain_dimensions(
            src_w,
            src_h,
            params.width,
            params.height,
        );
        validate_output_dimensions(dst_w, dst_h)?;

        if dst_w != src_w || dst_h != src_h {
            resize_image(&img, dst_w, dst_h)?
        } else {
            img
        }
    } else {
        img
    };

    // 出力フォーマットを決定（リクエストされたフォーマット or 元のフォーマット or JPEG）
    let output_format = determine_output_format(source_format, params.format);
    let content_type = output_format.content_type();
    let output_bytes = encode_image(&resized, output_format, params.quality)?;

    Ok((Bytes::from(output_bytes), content_type))
}

/// 画像バイト列をデコードし、DynamicImage と元のフォーマットを返す
fn decode_with_format(input: &Bytes) -> Result<(DynamicImage, Option<ImageFormat>), TransformError> {
    let reader = ImageReader::new(Cursor::new(input.as_ref()))
        .with_guessed_format()
        .map_err(|e| TransformError::ProcessingFailed(format!("failed to guess format: {e}")))?;

    let source_format = reader.format();

    let img = reader
        .decode()
        .map_err(|e| TransformError::ProcessingFailed(format!("decode failed: {e}")))?;

    Ok((img, source_format))
}

/// ソース画像の総ピクセル数を検証し、メモリ枯渇を防ぐ
fn validate_source_dimensions(width: u32, height: u32) -> Result<(), TransformError> {
    let total_pixels = width as u64 * height as u64;
    if total_pixels > MAX_PIXELS {
        return Err(TransformError::ResolutionTooLarge { width, height });
    }
    Ok(())
}

/// 出力画像のサイズを検証する
fn validate_output_dimensions(width: u32, height: u32) -> Result<(), TransformError> {
    if width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(TransformError::ResolutionTooLarge { width, height });
    }
    Ok(())
}

/// 出力フォーマットを決定する
fn determine_output_format(
    _source_format: Option<ImageFormat>,
    requested_format: OutputFormat,
) -> OutputFormat {
    // media-core の TransformParams は format フィールドを持たないため、
    // リクエストされたフォーマットをそのまま使用
    requested_format
}

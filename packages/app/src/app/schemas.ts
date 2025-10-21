import {
  array,
  type InferOutput,
  minLength,
  minValue,
  number,
  object,
  optional,
  pipe,
  string,
  trim,
  url,
} from "valibot";

export const uploadSignedUrlRequestSchema = array(
  object({
    contentType: optional(pipe(string(), trim())),
    filename: pipe(string(), trim(), minLength(1)),
    size: pipe(number(), minValue(1)),
  }),
);

export type UploadSignedUrlRequest = InferOutput<
  typeof uploadSignedUrlRequestSchema
>;

export const uploadSignedUrlResponseSchema = array(
  object({
    key: pipe(string(), minLength(1)),
    url: pipe(string(), url(), minLength(1)),
  }),
);
export type UploadSignedUrlResponse = InferOutput<
  typeof uploadSignedUrlResponseSchema
>;

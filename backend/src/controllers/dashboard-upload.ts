import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../utils/errors.js";
import { Restaurant } from "../models/Restaurant.js";
export const uploadFoodImage: RequestHandler = async (req, res) => {
  const input = z
    .object({
      restaurantId: z.string().regex(/^[a-f\d]{24}$/i),
      image: z.string().max(5600000),
    })
    .strict()
    .parse(req.body);
  if (
    !(await Restaurant.exists({
      _id: input.restaurantId,
      ownerId: res.locals.user._id,
    }))
  )
    throw new ApiError(404, "NOT_FOUND", "Owned restaurant not found");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z\d+/=]+)$/.exec(
    input.image,
  );
  if (!match)
    throw new ApiError(
      400,
      "INVALID_IMAGE",
      "Choose a JPEG, PNG or WebP image",
    );
  const bytes = Buffer.from(match[2]!, "base64");
  const actual = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    ? "jpeg"
    : bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP"
        ? "webp"
        : null;
  if (
    actual !== match[1] ||
    bytes.length > 4 * 1024 * 1024 ||
    bytes.length < 12
  )
    throw new ApiError(
      400,
      "INVALID_IMAGE",
      "Image format or size is invalid (maximum 4 MB)",
    );
  const cloud = process.env.CLOUDINARY_CLOUD_NAME,
    key = process.env.CLOUDINARY_API_KEY,
    secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret)
    throw new ApiError(
      503,
      "UPLOAD_NOT_CONFIGURED",
      "Image uploads are not configured. Use an existing food image URL.",
    );
  if (!/^[a-z\d_-]+$/i.test(cloud))
    throw new ApiError(
      503,
      "UPLOAD_NOT_CONFIGURED",
      "Image uploads are not configured",
    );
  const timestamp = String(Math.floor(Date.now() / 1000)),
    folder = "foodiego/menu";
  const signature = crypto
    .createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${secret}`)
    .digest("hex");
  const form = new FormData();
  form.set("file", input.image);
  form.set("api_key", key);
  form.set("timestamp", timestamp);
  form.set("folder", folder);
  form.set("signature", signature);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: "POST", body: form, signal: AbortSignal.timeout(20000) },
  );
  const body = (await response.json()) as { secure_url?: string };
  if (
    !response.ok ||
    !body.secure_url?.startsWith("https://res.cloudinary.com/")
  )
    throw new ApiError(
      502,
      "UPLOAD_FAILED",
      "Image provider could not save this image",
    );
  res.status(201).json({ data: { url: body.secure_url } });
};

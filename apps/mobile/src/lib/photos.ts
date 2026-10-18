import { registerPhoto } from "@fyh/shared";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

const MAX_EDGE = 1600;

export type PhotoSource = "library" | "camera";
export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

const picked = (assets: ImagePicker.ImagePickerAsset[]): PickedPhoto[] =>
  assets.map((asset) => ({ uri: asset.uri, width: asset.width, height: asset.height }));

/** Lets the user choose or take photos (empty when cancelled). */
export async function pickPhotos(source: PhotoSource, remaining: number): Promise<PickedPhoto[]> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera access was not allowed. You can allow it in your phone's settings.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    return result.canceled ? [] : picked(result.assets);
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(remaining, 10)),
    quality: 1,
  });
  return result.canceled ? [] : picked(result.assets);
}

/**
 * Resizes to at most 1600 px and re-encodes as JPEG. This converts iPhone HEIC photos
 * (which the website cannot show) and drops most original metadata before upload.
 */
async function toJpeg(photo: PickedPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  // Shrink the longer edge to 1600 px; never enlarge small photos.
  if (photo.width >= photo.height && photo.width > MAX_EDGE) context.resize({ width: MAX_EDGE, height: null });
  else if (photo.height > photo.width && photo.height > MAX_EDGE) context.resize({ width: null, height: MAX_EDGE });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return result.uri;
}

/** Uploads one photo to the listing's private folder and registers it. */
export async function uploadPhoto(listingId: string, photo: PickedPhoto, isCover: boolean, sortOrder: number) {
  const jpegUri = await toJpeg(photo);
  const bytes = await fetch(jpegUri).then((response) => response.arrayBuffer());
  const key = `${listingId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("listing-uploads").upload(key, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("The photo could not be uploaded. Check your connection and try again.");
  try {
    return await registerPhoto(supabase, listingId, key, isCover, sortOrder);
  } catch (failure) {
    await supabase.storage.from("listing-uploads").remove([key]);
    throw failure;
  }
}

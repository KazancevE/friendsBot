import { expect, test } from "vitest";
import { buildObjectKey, buildPublicUrl, keyFromPublicUrl } from "../../src/storage/object-storage.ts";
import { loadS3Config } from "../../src/storage/s3-config.ts";

test("loadS3Config returns null without bucket", () => {
  expect(loadS3Config({})).toBeNull();
});

test("loadS3Config builds defaults from endpoint and bucket", () => {
  const config = loadS3Config({
    S3_BUCKET: "friends-bot-media",
    S3_ENDPOINT: "https://storage.yandexcloud.net",
    S3_REGION: "ru-central1",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
  });
  expect(config).toEqual({
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    bucket: "friends-bot-media",
    accessKeyId: "key",
    secretAccessKey: "secret",
    publicBaseUrl: "https://storage.yandexcloud.net/friends-bot-media",
    keyPrefix: "menu",
  });
});

test("object storage helpers build keys and urls", () => {
  const config = {
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    bucket: "friends-bot-media",
    accessKeyId: "key",
    secretAccessKey: "secret",
    publicBaseUrl: "https://storage.yandexcloud.net/friends-bot-media",
    keyPrefix: "menu",
  };
  const key = buildObjectKey(config.keyPrefix, "photo.jpg");
  expect(key).toBe("menu/photo.jpg");
  const url = buildPublicUrl(config, key);
  expect(url).toBe("https://storage.yandexcloud.net/friends-bot-media/menu/photo.jpg");
  expect(keyFromPublicUrl(config, url)).toBe("menu/photo.jpg");
  expect(keyFromPublicUrl(config, "https://other.example/photo.jpg")).toBeNull();
});

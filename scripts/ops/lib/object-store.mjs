const trimSlashes = (value) => String(value ?? "").replace(/^\/+|\/+$/g, "");

export const buildArtifactObjectKey = ({
  prefix,
  stamp,
  fileName
}) => {
  const normalizedPrefix = trimSlashes(prefix);
  return [normalizedPrefix, trimSlashes(stamp), trimSlashes(fileName)]
    .filter(Boolean)
    .join("/");
};

export const buildArtifactPublicUrl = ({
  publicBaseUrl,
  objectKey
}) => {
  const baseUrl = String(publicBaseUrl ?? "").trim().replace(/\/+$/g, "");
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/${trimSlashes(objectKey)}`;
};

export const createObjectStoreClient = async (env = process.env) => {
  if (env.OPS_USE_MOCK_ARTIFACT_PUBLISH === "1") {
    return {
      putObject: async ({ objectKey }) => ({
        objectKey,
        url: buildArtifactPublicUrl({
          publicBaseUrl: env.OPS_ARTIFACT_PUBLIC_BASE_URL,
          objectKey
        })
      })
    };
  }

  const bucket = env.OPS_ARTIFACT_BUCKET?.trim();
  const region = env.OPS_ARTIFACT_REGION?.trim() || "auto";
  const accessKeyId = env.OPS_ARTIFACT_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.OPS_ARTIFACT_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("OPS_ARTIFACT_CONFIG_MISSING");
  }

  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const endpoint = env.OPS_ARTIFACT_ENDPOINT?.trim() || undefined;
  const publicBaseUrl = env.OPS_ARTIFACT_PUBLIC_BASE_URL;
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return {
    putObject: async ({ objectKey, body, contentType }) => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: body,
          ContentType: contentType
        })
      );

      return {
        objectKey,
        url: buildArtifactPublicUrl({ publicBaseUrl, objectKey })
      };
    }
  };
};

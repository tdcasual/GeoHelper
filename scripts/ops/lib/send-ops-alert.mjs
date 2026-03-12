export const sendOpsAlert = async ({
  webhookUrl,
  payload,
  env = process.env
}) => {
  if (!webhookUrl) {
    return null;
  }

  if (env.OPS_USE_MOCK_NOTIFY === "1") {
    return {
      delivered: true,
      payload
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return {
      delivered: response.ok,
      payload
    };
  } catch {
    return {
      delivered: false,
      payload
    };
  }
};

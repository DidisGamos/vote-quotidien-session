import handler from "../lib/votes-handler.js";

export default async function (req, res) {
  const requestBody =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : typeof req.body === "string"
        ? req.body
        : typeof req.body === "undefined"
          ? undefined
          : JSON.stringify(req.body);

  const request = new Request(`https://${req.headers.host || "localhost"}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: requestBody,
  });

  const response = await handler(request);
  const text = await response.text();
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.send(text);
}

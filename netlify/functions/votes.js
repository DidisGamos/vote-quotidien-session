// netlify/functions/votes.js
// Wrapper simple pour la logique partagée, compatible Netlify et Vercel.

import handler from "../../lib/votes-handler.js";

export default handler;

export const config = {
  path: "/api/votes",
};

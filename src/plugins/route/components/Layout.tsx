import { html } from "hono/html";

const DEFAULT_FAVICON = (
  <link
    rel="icon"
    href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><defs><linearGradient id='nodeGradient' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%233498db'/><stop offset='100%' stop-color='%232980b9'/></linearGradient><linearGradient id='centerNodeGradient' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%232ecc71'/><stop offset='100%' stop-color='%2327ae60'/></linearGradient></defs><circle cx='50' cy='50' r='45' fill='%23f5f7fa'/><path d='M30,30 L50,50' stroke='%23bdc3c7' stroke-width='2' stroke-linecap='round'/><path d='M70,30 L50,50' stroke='%23bdc3c7' stroke-width='2' stroke-linecap='round'/><path d='M30,70 L50,50' stroke='%23bdc3c7' stroke-width='2' stroke-linecap='round'/><path d='M70,70 L50,50' stroke='%23bdc3c7' stroke-width='2' stroke-linecap='round'/><polygon points='30,15 45,25 45,45 30,55 15,45 15,25' fill='url(%23nodeGradient)' stroke='%232980b9' stroke-width='1.5'/><polygon points='70,15 85,25 85,45 70,55 55,45 55,25' fill='url(%23nodeGradient)' stroke='%232980b9' stroke-width='1.5'/><polygon points='30,45 45,55 45,75 30,85 15,75 15,55' fill='url(%23nodeGradient)' stroke='%232980b9' stroke-width='1.5'/><polygon points='70,45 85,55 85,75 70,85 55,75 55,55' fill='url(%23nodeGradient)' stroke='%232980b9' stroke-width='1.5'/><polygon points='50,30 65,40 65,60 50,70 35,60 35,40' fill='url(%23centerNodeGradient)' stroke='%2327ae60' stroke-width='2'/><circle cx='30' cy='30' r='3' fill='%23ffffff'/><circle cx='70' cy='30' r='3' fill='%23ffffff'/><circle cx='30' cy='70' r='3' fill='%23ffffff'/><circle cx='70' cy='70' r='3' fill='%23ffffff'/><circle cx='50' cy='50' r='4' fill='%23ffffff'/></svg>"
    type="image/svg+xml"
  ></link>
);

export const BaseLayout = (
  props: { children?: any; title?: string; heads?: any } = {
    title: "Microservice Template",
  }
) =>
  html`<!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${props.title}</title>
        ${props.heads}
      </head>
      <body>
        ${props.children}
      </body>
    </html>`;

export const HtmxLayout = (
  props: { children?: any; title: string; favicon?: any } = {
    title: "Microservice Template",
  }
) =>
  BaseLayout({
    title: props.title,
    heads: html`
      <script src="https://unpkg.com/htmx.org@latest"></script>
      <script src="https://unpkg.com/hyperscript.org@latest"></script>
      <script src="https://cdn.tailwindcss.com"></script>
      ${props.favicon || DEFAULT_FAVICON}
    `,
    children: props.children,
  });

import prettier from "prettier";

export async function formatCode(code: string): Promise<string> {
  try {
    return prettier.format(code, { parser: "typescript" });
  } catch {
    return code;
  }
}

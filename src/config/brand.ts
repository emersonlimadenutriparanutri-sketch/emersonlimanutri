/**
 * MARCA — ponto único de personalização por cliente.
 *
 * Ao revender o app para outro nutricionista, é AQUI (e nos tokens de cor
 * do src/index.css) que se troca a identidade. Nenhum outro arquivo
 * precisa ser tocado.
 */
export const brand = {
  nome: import.meta.env.VITE_BRAND_NAME || "Consultório",
  tagline: import.meta.env.VITE_BRAND_TAGLINE || "Gestão clínica para nutricionistas",
  /** Iniciais exibidas no selo da sidebar quando não há logo. */
  iniciais: (import.meta.env.VITE_BRAND_NAME || "Consultório").slice(0, 2).toUpperCase(),
  logoUrl: import.meta.env.VITE_BRAND_LOGO || "",
  suporte: import.meta.env.VITE_BRAND_SUPORTE || "",
};

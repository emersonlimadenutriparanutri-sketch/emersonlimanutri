/**
 * Valores de referência laboratoriais x faixas ótimas funcionais.
 *
 * A coluna "laboratório" é o intervalo de normalidade usual; a coluna
 * "ótimo" é a faixa de melhor funcionamento discutida na prática clínica
 * funcional. As duas são exibidas lado a lado — a leitura final é sempre
 * do profissional, considerando clínica, contexto e o laudo original.
 */
export interface ReferenciaMarcador {
  nome: string;
  unidade: string;
  perfil: "Metabólico" | "Lipídico" | "Tireoide" | "Hormonal" | "Hematológico" | "Vitaminas e minerais" | "Hepático e renal" | "Inflamação";
  sexo?: "feminino" | "masculino";
  ref?: [number, number];
  otimo?: [number, number];
  sinonimos?: string[];
}

export const REFERENCIAS: ReferenciaMarcador[] = [
  { nome: "Glicose de jejum", unidade: "mg/dL", perfil: "Metabólico", ref: [70, 99], otimo: [75, 88], sinonimos: ["glicemia", "glicemia de jejum", "glicose"] },
  { nome: "Insulina de jejum", unidade: "µUI/mL", perfil: "Metabólico", ref: [2.6, 24.9], otimo: [2, 6], sinonimos: ["insulina"] },
  { nome: "HOMA-IR", unidade: "", perfil: "Metabólico", ref: [0, 2.7], otimo: [0, 1.5], sinonimos: ["homa", "homa ir"] },
  { nome: "Hemoglobina glicada", unidade: "%", perfil: "Metabólico", ref: [4, 5.6], otimo: [4.6, 5.2], sinonimos: ["hba1c", "a1c", "glicada"] },
  { nome: "Ácido úrico", unidade: "mg/dL", perfil: "Metabólico", ref: [2.4, 6], otimo: [3, 5], sinonimos: ["urico"] },

  { nome: "Colesterol total", unidade: "mg/dL", perfil: "Lipídico", ref: [0, 190], otimo: [140, 180], sinonimos: ["colesterol"] },
  { nome: "HDL", unidade: "mg/dL", perfil: "Lipídico", ref: [40, 120], otimo: [55, 90], sinonimos: ["hdl colesterol"] },
  { nome: "LDL", unidade: "mg/dL", perfil: "Lipídico", ref: [0, 130], otimo: [50, 100], sinonimos: ["ldl colesterol"] },
  { nome: "Triglicerídeos", unidade: "mg/dL", perfil: "Lipídico", ref: [0, 150], otimo: [40, 90], sinonimos: ["triglicerides", "tg"] },

  { nome: "TSH", unidade: "µUI/mL", perfil: "Tireoide", ref: [0.4, 4.5], otimo: [0.8, 2] },
  { nome: "T4 livre", unidade: "ng/dL", perfil: "Tireoide", ref: [0.7, 1.8], otimo: [1.1, 1.6], sinonimos: ["t4l", "tiroxina livre"] },
  { nome: "T3 livre", unidade: "pg/mL", perfil: "Tireoide", ref: [2.0, 4.4], otimo: [3.0, 4.2], sinonimos: ["t3l"] },
  { nome: "Anti-TPO", unidade: "UI/mL", perfil: "Tireoide", ref: [0, 34], otimo: [0, 9], sinonimos: ["antitpo", "anti tpo"] },

  { nome: "Vitamina D (25-OH)", unidade: "ng/mL", perfil: "Vitaminas e minerais", ref: [30, 100], otimo: [40, 60], sinonimos: ["vitamina d", "25 oh vitamina d", "25(oh)d"] },
  { nome: "Vitamina B12", unidade: "pg/mL", perfil: "Vitaminas e minerais", ref: [200, 900], otimo: [500, 800], sinonimos: ["b12", "cobalamina"] },
  { nome: "Ferritina", unidade: "ng/mL", perfil: "Vitaminas e minerais", ref: [15, 150], otimo: [50, 120] },
  { nome: "Ferro sérico", unidade: "µg/dL", perfil: "Vitaminas e minerais", ref: [50, 170], otimo: [70, 140], sinonimos: ["ferro"] },
  { nome: "Zinco", unidade: "µg/dL", perfil: "Vitaminas e minerais", ref: [70, 120], otimo: [90, 120] },
  { nome: "Magnésio", unidade: "mg/dL", perfil: "Vitaminas e minerais", ref: [1.6, 2.6], otimo: [2.0, 2.5], sinonimos: ["magnesio"] },

  { nome: "Hemoglobina", unidade: "g/dL", perfil: "Hematológico", ref: [12, 16], otimo: [13, 15], sinonimos: ["hb"] },
  { nome: "Hematócrito", unidade: "%", perfil: "Hematológico", ref: [36, 47], otimo: [38, 45], sinonimos: ["ht", "hematocrito"] },

  { nome: "PCR ultrassensível", unidade: "mg/L", perfil: "Inflamação", ref: [0, 3], otimo: [0, 1], sinonimos: ["pcr", "proteina c reativa"] },
  { nome: "Homocisteína", unidade: "µmol/L", perfil: "Inflamação", ref: [5, 15], otimo: [5, 8], sinonimos: ["homocisteina"] },

  { nome: "TGO (AST)", unidade: "U/L", perfil: "Hepático e renal", ref: [0, 40], otimo: [10, 26], sinonimos: ["ast", "tgo"] },
  { nome: "TGP (ALT)", unidade: "U/L", perfil: "Hepático e renal", ref: [0, 41], otimo: [10, 26], sinonimos: ["alt", "tgp"] },
  { nome: "Gama GT", unidade: "U/L", perfil: "Hepático e renal", ref: [0, 38], otimo: [8, 22], sinonimos: ["ggt", "gama glutamil"] },
  { nome: "Creatinina", unidade: "mg/dL", perfil: "Hepático e renal", ref: [0.5, 1.1], otimo: [0.6, 0.9] },

  { nome: "Estradiol", unidade: "pg/mL", perfil: "Hormonal", sexo: "feminino", ref: [20, 350] },
  { nome: "Progesterona", unidade: "ng/mL", perfil: "Hormonal", sexo: "feminino", ref: [0.1, 25] },
  { nome: "Testosterona total", unidade: "ng/dL", perfil: "Hormonal", ref: [15, 70] },
  { nome: "SHBG", unidade: "nmol/L", perfil: "Hormonal", ref: [18, 114] },
  { nome: "Cortisol matinal", unidade: "µg/dL", perfil: "Hormonal", ref: [6, 19], otimo: [10, 15], sinonimos: ["cortisol"] },
];

function normalizar(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Encontra a referência de um marcador pelo nome ou por sinônimos. */
export function buscarReferencia(nome: string): ReferenciaMarcador | undefined {
  const alvo = normalizar(nome);
  return REFERENCIAS.find(
    (r) => normalizar(r.nome) === alvo || (r.sinonimos ?? []).some((s) => normalizar(s) === alvo),
  ) ?? REFERENCIAS.find(
    (r) => alvo.includes(normalizar(r.nome)) || (r.sinonimos ?? []).some((s) => alvo.includes(normalizar(s))),
  );
}

export type SituacaoMarcador = "abaixo" | "normal" | "atencao" | "acima" | "indefinido";

/**
 * Classifica um valor: fora da referência do laboratório é "abaixo"/"acima";
 * dentro do laboratório mas fora da faixa ótima é "atenção".
 */
export function classificarMarcador(
  valor: number | string,
  referencia?: ReferenciaMarcador,
  refManual?: [number | null | undefined, number | null | undefined],
): SituacaoMarcador {
  const n = typeof valor === "string" ? Number(String(valor).replace(",", ".")) : valor;
  if (!isFinite(n)) return "indefinido";

  const min = refManual?.[0] ?? referencia?.ref?.[0];
  const max = refManual?.[1] ?? referencia?.ref?.[1];
  if (min != null && n < min) return "abaixo";
  if (max != null && n > max) return "acima";

  const otimo = referencia?.otimo;
  if (otimo && (n < otimo[0] || n > otimo[1])) return "atencao";
  return min != null || max != null ? "normal" : "indefinido";
}

export const CORES_SITUACAO: Record<SituacaoMarcador, "success" | "warning" | "danger" | "muted"> = {
  normal: "success",
  atencao: "warning",
  abaixo: "danger",
  acima: "danger",
  indefinido: "muted",
};

export const ROTULOS_SITUACAO: Record<SituacaoMarcador, string> = {
  normal: "Dentro do ótimo",
  atencao: "Normal, fora do ótimo",
  abaixo: "Abaixo da referência",
  acima: "Acima da referência",
  indefinido: "Sem referência",
};

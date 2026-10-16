import { describe, expect, it } from "vitest";

import { navigation, pageTitle, parseRoute, routeHref } from "./router.js";

describe("hash router", () => {
  it("reads known routes from the hash", () => {
    expect(parseRoute("#/turmas")).toBe("turmas");
    expect(parseRoute("#/correcoes")).toBe("correcoes");
    expect(parseRoute("#/conta")).toBe("conta");
  });

  it("falls back to the home page for empty, unknown or anchor hashes", () => {
    expect(parseRoute("")).toBe("inicio");
    expect(parseRoute("#/")).toBe("inicio");
    expect(parseRoute("#/nao-existe")).toBe("inicio");
    expect(parseRoute("#conteudo")).toBe("inicio");
  });

  it("builds links and tab titles for every route", () => {
    expect(routeHref("aulas")).toBe("#/aulas");
    expect(pageTitle("correcoes")).toBe("Correções · EDUC.AI");
    expect(pageTitle("inicio")).toBe("Início · EDUC.AI");
  });

  it("groups the menu by teacher task", () => {
    expect(navigation.map((group) => group.label)).toEqual([
      null,
      "Sala de aula",
      "Comunicação",
    ]);
    expect(navigation.flatMap((group) => group.items)).toEqual([
      "inicio",
      "turmas",
      "aulas",
      "atividades",
      "correcoes",
      "recados",
      "boletins",
    ]);
  });
});

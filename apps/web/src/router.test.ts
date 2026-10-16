import { describe, expect, it } from "vitest";

import {
  navigation,
  pageTitle,
  parseLocation,
  parseRoute,
  routeHref,
} from "./router.js";

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

describe("routes with a parameter", () => {
  it("reads the class id from the class page address", () => {
    expect(
      parseLocation("#/turmas/5d73ea1d-9ab8-4384-960e-3a6f00e6328a"),
    ).toEqual({
      route: "turmas",
      param: "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
    });
    expect(parseLocation("#/turmas")).toEqual({ route: "turmas", param: null });
    expect(parseLocation("#/inicio/x")).toEqual({
      route: "inicio",
      param: null,
    });
  });

  it("opens the new class page", () => {
    expect(parseRoute("#/nova-turma")).toBe("nova-turma");
    expect(pageTitle("nova-turma")).toBe("Nova turma · EDUC.AI");
    expect(routeHref("turmas", "abc")).toBe("#/turmas/abc");
  });
});

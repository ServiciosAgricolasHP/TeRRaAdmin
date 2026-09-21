import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cacheKey,
  getCache,
  setCache,
  invalidate,
  subscribe,
  mergeListItem,
  removeListItem,
} from "./cache";

// El `mem` del módulo es global y se comparte entre tests, así que cada uno usa
// su propio scope en vez de limpiar. En Node no hay `localStorage`: las ramas
// con `persist` quedan en no-op silencioso (están envueltas en try/catch), y lo
// que se ejercita acá es la caché en memoria, que es la que sirve de verdad.
let n = 0;
const scope = () => `test${n++}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("cacheKey", () => {
  it("es el scope más los parámetros serializados", () => {
    expect(cacheKey("workdays", { wheres: [], order: undefined, take: undefined })).toBe(
      'workdays::{"wheres":[]}',
    );
  });

  it("sin parámetros deja el sufijo vacío", () => {
    expect(cacheKey("workers")).toBe("workers::");
    expect(cacheKey("workers", null)).toBe("workers::");
  });

  // Estas dos son la razón por la que el proyecto pagó lecturas de más: la
  // clave sale de JSON.stringify, así que depende del ORDEN de las propiedades
  // y `undefined` desaparece. Dos llamadas equivalentes forman claves distintas.
  it("el orden de las propiedades cambia la clave", () => {
    expect(cacheKey("c", { a: 1, b: 2 })).not.toBe(cacheKey("c", { b: 2, a: 1 }));
  });

  it("omitir una opción no es lo mismo que pasarla en undefined... salvo que sí", () => {
    // JSON.stringify descarta las claves con undefined, así que estas dos SÍ
    // coinciden. La trampa es la de arriba (el orden), no esta.
    expect(cacheKey("c", { wheres: [], order: undefined })).toBe(cacheKey("c", { wheres: [] }));
    // Pero agregar una opción con valor sí forma otra clave, y por eso
    // AGENTS.md avisa de no tocar `order`/`take` en el Dashboard.
    expect(cacheKey("c", { wheres: [] })).not.toBe(
      cacheKey("c", { wheres: [], order: ["name", "asc"] }),
    );
  });
});

describe("getCache / setCache", () => {
  it("guarda y devuelve", () => {
    const k = cacheKey(scope(), { wheres: [] });
    expect(getCache(k)).toBeUndefined();
    setCache(k, [1, 2, 3]);
    expect(getCache(k)).toEqual([1, 2, 3]);
  });

  it("vence al pasar el TTL", () => {
    vi.useFakeTimers();
    const k = cacheKey(scope(), { wheres: [] });
    setCache(k, ["dato"], { ttl: 1000 });
    vi.advanceTimersByTime(999);
    expect(getCache(k)).toEqual(["dato"]);
    vi.advanceTimersByTime(2);
    expect(getCache(k)).toBeUndefined();
  });

  it("el TTL se sella al escribir, y el último que escribe manda", () => {
    // Es lo que hace que dos pantallas con TTL distinto se acorten el
    // vencimiento entre ellas sin que se note: por eso las consultas
    // compartidas van por un helper único.
    vi.useFakeTimers();
    const k = cacheKey(scope(), { wheres: [] });
    setCache(k, ["largo"], { ttl: 600_000 });
    setCache(k, ["corto"], { ttl: 1000 });
    vi.advanceTimersByTime(1500);
    expect(getCache(k)).toBeUndefined();
  });

  it("guardar undefined no se distingue de no tener nada", () => {
    const k = cacheKey(scope(), { wheres: [] });
    setCache(k, undefined);
    expect(getCache(k)).toBeUndefined();
  });
});

describe("invalidate", () => {
  it("borra todas las claves del scope, no solo una", () => {
    const s = scope();
    const k1 = cacheKey(s, { wheres: [] });
    const k2 = cacheKey(s, { wheres: [["a", "==", 1]] });
    setCache(k1, ["a"]);
    setCache(k2, ["b"]);
    invalidate(s);
    expect(getCache(k1)).toBeUndefined();
    expect(getCache(k2)).toBeUndefined();
  });

  it("no toca otros scopes", () => {
    const s1 = scope();
    const s2 = scope();
    setCache(cacheKey(s1, {}), ["a"]);
    setCache(cacheKey(s2, {}), ["b"]);
    invalidate(s1);
    expect(getCache(cacheKey(s2, {}))).toEqual(["b"]);
  });

  it("no confunde un scope con otro que lo tiene de prefijo", () => {
    // "workday" no debe arrastrar a "workdays" — el separador "::" lo evita.
    setCache(cacheKey("workday", {}), ["uno"]);
    setCache(cacheKey("workdays", {}), ["muchos"]);
    invalidate("workday");
    expect(getCache(cacheKey("workday", {}))).toBeUndefined();
    expect(getCache(cacheKey("workdays", {}))).toEqual(["muchos"]);
  });

  it("avisa a los suscriptores", () => {
    const s = scope();
    const fn = vi.fn();
    const desuscribir = subscribe(s, fn);
    invalidate(s);
    expect(fn).toHaveBeenCalledTimes(1);
    desuscribir();
    invalidate(s);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("un suscriptor que lanza no rompe a los otros", () => {
    const s = scope();
    const bueno = vi.fn();
    subscribe(s, () => {
      throw new Error("boom");
    });
    subscribe(s, bueno);
    expect(() => invalidate(s)).not.toThrow();
    expect(bueno).toHaveBeenCalled();
  });
});

describe("mergeListItem / removeListItem", () => {
  // Estos mutan datos cacheados que después las pantallas leen como verdad: un
  // bug acá alimenta una nómina con datos de banco viejos.
  it("agrega al final si el id no estaba", () => {
    const s = scope();
    const k = cacheKey(s, { wheres: [] });
    setCache(k, [{ id: "a", n: 1 }]);
    mergeListItem(s, { id: "b", n: 2 });
    expect(getCache(k)).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
  });

  it("reemplaza en el lugar si ya estaba, sin mover el orden", () => {
    const s = scope();
    const k = cacheKey(s, { wheres: [] });
    setCache(k, [{ id: "a" }, { id: "b" }, { id: "c" }]);
    mergeListItem(s, { id: "b", n: 99 });
    expect(getCache(k)).toEqual([{ id: "a" }, { id: "b", n: 99 }, { id: "c" }]);
  });

  it("NO toca listas filtradas, porque no sabe si el item cumple el filtro", () => {
    const s = scope();
    const kTodo = cacheKey(s, { wheres: [] });
    const kFiltrada = cacheKey(s, { wheres: [["activo", "==", true]] });
    setCache(kTodo, [{ id: "a" }]);
    setCache(kFiltrada, [{ id: "a" }]);
    mergeListItem(s, { id: "b" });
    expect(getCache(kTodo)).toHaveLength(2);
    expect(getCache(kFiltrada)).toHaveLength(1);
  });

  it("respeta la entrada sin parámetros como lista completa", () => {
    const s = scope();
    const k = cacheKey(s);
    setCache(k, [{ id: "a" }]);
    mergeListItem(s, { id: "b" });
    // cacheKey(s) deja el sufijo vacío y no parsea como objeto, así que esa
    // entrada NO se considera "lista completa" y queda intacta.
    expect(getCache(k)).toHaveLength(1);
  });

  it("no hace nada sin item o sin id", () => {
    const s = scope();
    const k = cacheKey(s, { wheres: [] });
    setCache(k, [{ id: "a" }]);
    mergeListItem(s, null);
    mergeListItem(s, { n: 1 });
    expect(getCache(k)).toEqual([{ id: "a" }]);
  });

  it("acepta otra clave de identidad", () => {
    const s = scope();
    const k = cacheKey(s, { wheres: [] });
    setCache(k, [{ rut: "1-9", n: 1 }]);
    mergeListItem(s, { rut: "1-9", n: 2 }, { idKey: "rut" });
    expect(getCache(k)).toEqual([{ rut: "1-9", n: 2 }]);
  });

  it("removeListItem saca solo de las listas completas", () => {
    const s = scope();
    const kTodo = cacheKey(s, { wheres: [] });
    const kFiltrada = cacheKey(s, { wheres: [["x", "==", 1]] });
    setCache(kTodo, [{ id: "a" }, { id: "b" }]);
    setCache(kFiltrada, [{ id: "a" }, { id: "b" }]);
    removeListItem(s, "a");
    expect(getCache(kTodo)).toEqual([{ id: "b" }]);
    expect(getCache(kFiltrada)).toHaveLength(2);
  });

  it("borrar un id que no está deja la lista igual", () => {
    const s = scope();
    const k = cacheKey(s, { wheres: [] });
    setCache(k, [{ id: "a" }]);
    removeListItem(s, "zzz");
    expect(getCache(k)).toEqual([{ id: "a" }]);
  });

  it("no respeta el TTL original al mutar: la entrada conserva su vencimiento", () => {
    vi.useFakeTimers();
    const s = scope();
    const k = cacheKey(s, { wheres: [] });
    setCache(k, [{ id: "a" }], { ttl: 1000 });
    vi.advanceTimersByTime(500);
    mergeListItem(s, { id: "b" });
    vi.advanceTimersByTime(600);
    // Mutar no renueva el TTL: a los 1100 ms la entrada ya venció.
    expect(getCache(k)).toBeUndefined();
  });
});

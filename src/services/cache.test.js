import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cacheKey,
  getCache,
  setCache,
  invalidate,
  subscribe,
  mergeListItem,
  removeListItem,
  countedList,
} from "./cache";

// El `mem` del módulo se comparte entre tests, así que cada uno usa su propio
// scope. En Node no hay `localStorage`: las ramas con `persist` no hacen nada
// (están envueltas en try/catch) y se ejercita solo la caché en memoria.
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

  // La clave sale de JSON.stringify: depende del ORDEN de las propiedades y
  // descarta las que valen `undefined`.
  it("el orden de las propiedades cambia la clave", () => {
    expect(cacheKey("c", { a: 1, b: 2 })).not.toBe(cacheKey("c", { b: 2, a: 1 }));
  });

  it("omitir una opción no es lo mismo que pasarla en undefined... salvo que sí", () => {
    // JSON.stringify descarta las claves con undefined: estas dos coinciden.
    expect(cacheKey("c", { wheres: [], order: undefined })).toBe(cacheKey("c", { wheres: [] }));
    // Una opción con valor sí forma otra clave.
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
    // Dos pantallas que comparten clave con TTL distinto se acortan el
    // vencimiento entre ellas.
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
  // Actualizan en el lugar las listas completas cacheadas.
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

describe("countedList", () => {
  // Servicio falso: `countedList` solo usa el nombre de la colección y `list()`.
  // `llamadas` cuenta las llamadas a `list()`, salgan o no de la caché.
  const fakeService = (collectionName, data) => {
    const service = {
      collectionName,
      llamadas: 0,
      async list(opts) {
        service.llamadas += 1;
        const key = cacheKey(collectionName, {
          wheres: opts.wheres || [],
          order: opts.order,
          take: opts.take,
        });
        const hit = opts.cache ? getCache(key) : undefined;
        if (hit !== undefined) return hit;
        if (opts.cache) setCache(key, data, { ttl: opts.ttl || 60_000 });
        return data;
      },
    };
    return service;
  };

  it("la primera llamada cobra una lectura por documento", async () => {
    const svc = fakeService(scope(), [{ id: "a" }, { id: "b" }, { id: "c" }]);
    const { data, reads } = await countedList(svc, { cache: true });
    expect(data).toHaveLength(3);
    expect(reads).toBe(3);
  });

  it("la segunda sale de la caché y no cobra nada", async () => {
    const svc = fakeService(scope(), [{ id: "a" }, { id: "b" }]);
    await countedList(svc, { cache: true });
    const { data, reads } = await countedList(svc, { cache: true });
    expect(data).toHaveLength(2);
    expect(reads).toBe(0);
  });

  it("sin `cache` siempre cobra, aunque se llame mil veces", async () => {
    const svc = fakeService(scope(), [{ id: "a" }]);
    expect((await countedList(svc, {})).reads).toBe(1);
    expect((await countedList(svc, {})).reads).toBe(1);
  });

  it("opciones distintas son otra clave, así que vuelven a cobrar", async () => {
    const svc = fakeService(scope(), [{ id: "a" }, { id: "b" }]);
    expect((await countedList(svc, { cache: true, order: ["name", "asc"] })).reads).toBe(2);
    expect((await countedList(svc, { cache: true, order: ["name", "asc"] })).reads).toBe(0);
    expect((await countedList(svc, { cache: true })).reads).toBe(2);
  });

  it("una colección vacía cacheada informa 0 y no relee", async () => {
    // `[]` es un valor cacheado válido, no un fallo de caché: `getCache`
    // distingue por `undefined`, no por falsedad.
    const svc = fakeService(scope(), []);
    expect((await countedList(svc, { cache: true })).reads).toBe(0);
    await countedList(svc, { cache: true });
    expect(svc.llamadas).toBe(2);
  });
});

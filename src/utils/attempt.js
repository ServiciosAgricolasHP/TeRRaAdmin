// Corre una función (sincrónica o asíncrona) y devuelve `{ value }` si sale
// bien o `{ error }` si lanza, sin volver a lanzar. Es la forma de manejar un
// error dentro de un componente o un hook: React Compiler no compila un `try`
// con `finally`, ni un `try` con condicionales u operadores lógicos adentro, y
// se salta el archivo entero.
export async function attempt(fn) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error };
  }
}

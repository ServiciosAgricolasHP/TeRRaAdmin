import { useEffect, useState } from "react";
import { fileUrl } from "../services/storageFiles";

// El enlace de un adjunto, pedido a Storage al mostrarse (`fileUrl` guarda los
// ya pedidos). Mientras llega, `url` va vacío; `failed` si Storage no lo
// entregó. Al cambiar de archivo no muestra el enlace del anterior.
export function useFileUrl(path) {
  const [state, setState] = useState({ path: null, url: "", failed: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    fileUrl(path).then(
      (url) => live && setState({ path, url, failed: false }),
      () => live && setState({ path, url: "", failed: true }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  if (state.path !== path) return { url: "", failed: false };
  return { url: state.url, failed: state.failed };
}

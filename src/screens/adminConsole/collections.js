// Todas las colecciones que usa la app, agrupadas por área. Es una lista a
// mano: una colección que no esté acá no aparece en los conteos.
export const MAIN_COLLECTIONS = [
  // Producción
  { id: "workdays", group: "Producción", label: "Workdays", note: "jornadas registradas (la tabla más grande)" },
  { id: "cycles", group: "Producción", label: "Ciclos", note: "abiertos y cerrados" },
  { id: "faenas", group: "Producción", label: "Faenas", note: "" },
  { id: "subfaenas", group: "Producción", label: "Subfaenas", note: "" },
  { id: "cycleSummaries", group: "Producción", label: "Resúmenes de ciclo", note: "tarifas de cobro y títulos, 1 por ciclo configurado" },
  { id: "catalogs", group: "Producción", label: "Catálogos", note: "calidades, envases, tipos de trato" },
  { id: "laborGroups", group: "Producción", label: "Grupos de labor", note: "" },

  // Personas y pagos
  { id: "worker", group: "Personas y pagos", label: "Trabajadores", note: "id del documento = RUT" },
  { id: "groupLeader", group: "Personas y pagos", label: "Líderes de grupo", note: "lista curada" },
  { id: "payrolls", group: "Personas y pagos", label: "Nóminas", note: "" },
  { id: "payrollSnapshots", group: "Personas y pagos", label: "JSON de nóminas", note: "uno por nómina" },
  { id: "payrollConfig", group: "Personas y pagos", label: "Config de nómina", note: "normalmente 1 documento" },
  { id: "portalPayslips", group: "Personas y pagos", label: "Portal: fichas", note: "una por trabajador de la nómina publicada" },
  { id: "portalMeta", group: "Personas y pagos", label: "Portal: nómina publicada", note: "un solo documento" },
  { id: "advances", group: "Personas y pagos", label: "Anticipos / Bonos", note: "" },
  { id: "employments", group: "Personas y pagos", label: "Contratos y honorarios", note: "un período por documento" },
  { id: "employers", group: "Personas y pagos", label: "Empleadores", note: "" },
  { id: "feeLists", group: "Personas y pagos", label: "Listas de honorarios", note: "" },
  { id: "contributionLists", group: "Personas y pagos", label: "Listas de imposiciones", note: "una por empleador y mes" },
  { id: "employmentConfig", group: "Personas y pagos", label: "Config de honorarios", note: "normalmente 1 documento" },

  // Transporte
  { id: "transports", group: "Transporte", label: "Vueltas", note: "" },
  { id: "transportPayments", group: "Transporte", label: "Resúmenes", note: "" },
  { id: "transportPayrolls", group: "Transporte", label: "Quincenas", note: "agrupan resúmenes" },
  { id: "carriers", group: "Transporte", label: "Transportistas", note: "" },

  // Facturación
  { id: "dteDocuments", group: "Facturación", label: "Documentos DTE", note: "la segunda más grande; mezcla empresas y períodos" },
  { id: "companies", group: "Facturación", label: "Empresas", note: "" },
  { id: "costCenters", group: "Facturación", label: "Centros de costo", note: "" },
  { id: "informalExpenses", group: "Facturación", label: "Gastos informales", note: "" },
  // Cheques y pagos
  { id: "commitments", group: "Cheques y pagos", label: "Vencimientos", note: "cheques, cuotas y pagos comprometidos" },
  { id: "commitmentSeries", group: "Cheques y pagos", label: "Créditos y pagos recurrentes", note: "las series que generan vencimientos" },
  { id: "commitmentConfig", group: "Cheques y pagos", label: "Config de avisos", note: "normalmente 1 documento" },
  { id: "commitmentNotifications", group: "Cheques y pagos", label: "Avisos enviados", note: "1 por día con correo; la escribe la función diaria" },

  // Otros registros
  { id: "priceBookEntries", group: "Otros registros", label: "Libro de precios", note: "" },
  { id: "priceBookConfig", group: "Otros registros", label: "Config del libro de precios", note: "normalmente 1 documento" },
  { id: "contactCards", group: "Otros registros", label: "Información y cuentas", note: "" },
  { id: "phoneContacts", group: "Otros registros", label: "Agenda telefónica", note: "" },
  { id: "interestLinks", group: "Otros registros", label: "Links útiles", note: "" },
  { id: "indicators", group: "Otros registros", label: "Indicadores", note: "" },
  { id: "harvestWeights", group: "Otros registros", label: "Pesajes QR", note: "la escribe la app de escaneo; acá solo se lee" },
  { id: "qrPrefixes", group: "Otros registros", label: "Prefijos QR", note: "1 por código físico" },

  // Sistema
  { id: "users", group: "Sistema", label: "Perfiles de usuario", note: "id del documento = UID de Firebase" },
  { id: "logs", group: "Sistema", label: "Registros de auditoría", note: "puede ser MUY grande" },
  { id: "functionJobs", group: "Sistema", label: "Tareas del backend", note: "cola de Cloud Functions; nada la poda todavía" },
  { id: "backups", group: "Sistema", label: "Respaldos en JSON", note: "una ficha por respaldo; el archivo está en Cloud Storage" },
  { id: "helpQuestions", group: "Sistema", label: "Preguntas sin respuesta en la ayuda", note: "las guarda \"Avisar que falta\"" },
];

// Grupos en el orden en que aparecen por primera vez en MAIN_COLLECTIONS.
export const COLLECTION_GROUPS = [...new Set(MAIN_COLLECTIONS.map((c) => c.group))];

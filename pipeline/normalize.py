import pandas as pd
import re

# Mapeo de variantes de nombre de local → nombre canónico
PAIGE = "ESCUELA PADRE GUSTAVO LE PAIGE"

LOCAL_MAP = {
    "ESCUELA BASICA LO VELASQUEZ": "ESCUELA LO VELASQUEZ",
    # Todos los formatos de Le Paige → un solo local
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE":    PAIGE,
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE L1": PAIGE,
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE L2": PAIGE,
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE":    PAIGE,
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE L1": PAIGE,
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE L2": PAIGE,
    "ESCUELA PADRE GUSTAVO LE PAIGE L1": PAIGE,
    "ESCUELA PADRE GUSTAVO LE PAIGE L2": PAIGE,
    "INSTITUTO CUMBRE DE CONDORES PONIENTE L1": "INSTITUTO CUMBRE DE CONDORES PONIENTE L1",
    "INSTITUTO CUMBRE DE CONDORES PONIENTE L2": "INSTITUTO CUMBRE DE CONDORES PONIENTE L2",
}

SUMMARY_ROWS = {"Válidamente Emitidos", "Total Votación", "Total Votaci\xf3n",
                "V\xe1lidamente Emitidos"}


def _normalize_local(name: str) -> str:
    name = str(name).strip().upper()
    # Fix encoding artifacts: Â° (mojibake de °) → ° ; también Â con ordinal masculino
    name = name.replace("Â°", "°").replace("Âº", "º")
    # normalizar encoding artifacts de LAURA VICUÑA
    name = name.replace("VICU\xd1A", "VICUÑA").replace("VICU?A", "VICUÑA")
    return LOCAL_MAP.get(name, name)


def _normalize_candidato(c: str) -> str:
    c = str(c).strip()
    if c.upper() in ("VOTOS EN BLANCO", "VOTOS EN BLANCO "):
        return "__blancos__"
    if c.upper() in ("VOTOS NULOS", "VOTOS NULOS "):
        return "__nulos__"
    return c


def _normalize_partido(p: str) -> str:
    if pd.isna(p):
        return "otros"
    p = str(p).strip()
    # "IND - RN" → "IND-RN"
    m = re.match(r"IND\s*-\s*(\w+)", p)
    if m:
        return f"IND-{m.group(1)}"
    return p


def _load_muni24(data_dir: str) -> pd.DataFrame:
    df = pd.read_csv(f"{data_dir}/muni24.csv", encoding="utf-8")
    df = df.rename(columns={"Local": "local", "Candidatos": "candidato", "Votos": "votos",
                             "Partido": "partido"})
    df["pacto"] = df["partido"]
    df["election"] = "muni24"
    return df[["election", "local", "candidato", "votos", "partido", "pacto"]]


def _load_parla25(data_dir: str) -> pd.DataFrame:
    df = pd.read_csv(f"{data_dir}/parla1v.csv", encoding="utf-8")
    df = df.rename(columns={"local_votacion": "local", "Candidatos": "candidato",
                             "Votos": "votos", "Partido": "partido", "Pacto_final": "pacto"})
    df = df[~df["candidato"].isin(SUMMARY_ROWS)]
    df["election"] = "parla25"
    return df[["election", "local", "candidato", "votos", "partido", "pacto"]]


def _load_pres1v(data_dir: str) -> pd.DataFrame:
    df = pd.read_csv(f"{data_dir}/1Vrenca.csv", encoding="utf-8-sig")
    df = df.rename(columns={"local_votacion": "local", "Candidatos": "candidato", "Votos": "votos"})
    df = df[~df["candidato"].isin(SUMMARY_ROWS)]
    df["partido"] = "presidencial"
    df["pacto"] = "presidencial"
    df["election"] = "pres1v25"
    return df[["election", "local", "candidato", "votos", "partido", "pacto"]]


def _load_pres2v(data_dir: str) -> pd.DataFrame:
    df = pd.read_csv(f"{data_dir}/2Vrenca.csv", encoding="utf-8-sig")
    df = df.rename(columns={"local_votacion": "local", "Candidaturas": "candidato", "Total": "votos"})
    df = df[~df["candidato"].isin(SUMMARY_ROWS)]
    df["partido"] = "presidencial"
    df["pacto"] = "presidencial"
    df["election"] = "pres2v25"
    return df[["election", "local", "candidato", "votos", "partido", "pacto"]]


def _load_conc24(data_dir: str) -> pd.DataFrame:
    """Carga concejales 2024 desde TXT separado por ; (UTF-8).
    Columna 'cargo' == 'CONCEJAL' marca a los electos por D'Hondt.
    """
    df = pd.read_csv(f"{data_dir}/conc24.txt", sep=";", encoding="utf-8")
    renca = df[df["Comuna"].str.upper().str.strip() == "RENCA"].copy()

    # Nombre completo desde columnas separadas
    # Usamos fillna("") para evitar "nan" al concatenar celdas vacías
    nombres    = renca["Nombres"].fillna("").str.strip()
    apellido1  = renca["Primer apellido"].fillna("").str.strip()
    apellido2  = renca["Segundo apellido"].fillna("").str.strip()
    renca["candidato"] = (nombres + " " + apellido1 + " " + apellido2).str.strip()

    # Filas con nombre vacío son resúmenes (blancos/nulos en otro formato);
    # las mapeamos por contenido de columnas conocidas o las descartamos.
    def _resolve_conc24_candidato(row):
        cand = row["candidato"]
        if cand:
            return cand
        # Si alguna columna de texto lleva "BLANCO" o "NULO", mapeamos
        for col in row.index:
            val = str(row[col]).upper()
            if "BLANCO" in val:
                return "VOTOS EN BLANCO"
            if "NULO" in val:
                return "VOTOS NULOS"
        return None   # se descartará en el siguiente paso

    renca["candidato"] = renca.apply(_resolve_conc24_candidato, axis=1)
    # Descartar filas sin nombre resuelto
    renca = renca[renca["candidato"].notna() & (renca["candidato"] != "")].copy()

    renca = renca.rename(columns={
        "Local": "local",
        "Partido": "partido",
        "Pacto": "pacto",
        "Subpacto": "subpacto",
        "votos": "votos",
    })
    renca["votos"] = pd.to_numeric(renca["votos"], errors="coerce").fillna(0)
    renca["election"] = "conc24"

    # Normalizar subpacto: "---" → None (sin subpacto)
    renca["subpacto"] = renca["subpacto"].fillna("").str.strip()
    renca["subpacto"] = renca["subpacto"].apply(lambda s: None if s in ("---", "", "-") else s)

    # elected: True si alguna fila del candidato tiene cargo == 'CONCEJAL'
    elected_set = set(
        renca[renca["cargo"].fillna("").str.strip().str.upper() == "CONCEJAL"]["candidato"]
    )
    renca["elected"] = renca["candidato"].isin(elected_set)

    return renca[["election", "local", "candidato", "votos", "partido", "pacto", "subpacto", "elected"]]


def load_elections(data_dir: str) -> dict:
    """Carga los 5 archivos de elecciones, normaliza y devuelve dict {election_id: DataFrame}.
    Para conc24 incluye columna 'elected' (bool) por candidato.
    """
    loaders = {
        "conc24":   _load_conc24,
        "muni24":   _load_muni24,
        "parla25":  _load_parla25,
        "pres1v25": _load_pres1v,
        "pres2v25": _load_pres2v,
    }
    result = {}
    for eid, loader in loaders.items():
        df = loader(data_dir)
        df["local"]     = df["local"].apply(_normalize_local)
        df["candidato"] = df["candidato"].apply(_normalize_candidato)
        df["partido"]   = df["partido"].apply(_normalize_partido)
        df["pacto"]     = df["pacto"].fillna("otros").astype(str).str.strip()
        df["votos"]     = pd.to_numeric(df["votos"], errors="coerce").fillna(0)

        # Preservar elected y subpacto antes del groupby (solo conc24 los tiene)
        has_elected  = "elected"  in df.columns
        has_subpacto = "subpacto" in df.columns
        if has_elected:
            elected_map  = df.groupby("candidato")["elected"].any()
        if has_subpacto:
            # subpacto es constante por candidato; tomamos el primero no-nulo
            subpacto_map = (df.dropna(subset=["subpacto"])
                              .groupby("candidato")["subpacto"].first())

        group_cols = ["election", "local", "candidato", "partido", "pacto"]
        df = df.groupby(group_cols, as_index=False)["votos"].sum()

        if has_elected:
            df["elected"]  = df["candidato"].map(elected_map).fillna(False)
        if has_subpacto:
            df["subpacto"] = df["candidato"].map(subpacto_map)  # None si no tiene

        result[eid] = df
    return result


def load_locales(data_dir: str) -> pd.DataFrame:
    """Carga locales_final.csv. Convierte coordenadas con coma decimal a float."""
    df = pd.read_csv(f"{data_dir}/locales_final.csv", encoding="utf-8")
    df = df.rename(columns={"local_votacion": "local",
                             "Latitude": "lat", "Longitude": "lon"})
    df["lat"] = df["lat"].astype(str).str.replace(",", ".").astype(float)
    df["lon"] = df["lon"].astype(str).str.replace(",", ".").astype(float)
    df["local"] = df["local"].apply(_normalize_local)
    # Deduplicar: L1 y L2 de Le Paige se unifican en un único punto
    df = df.drop_duplicates(subset=["local"]).reset_index(drop=True)
    return df[["local", "lat", "lon"]]

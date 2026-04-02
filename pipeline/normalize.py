import pandas as pd
import re

# Mapeo de variantes de nombre de local → nombre canónico
LOCAL_MAP = {
    "ESCUELA BASICA LO VELASQUEZ": "ESCUELA LO VELASQUEZ",
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE": "ESCUELA PADRE GUSTAVO LE PAIGE L1",  # muni24: todas las mesas van a L1 por default; se corrige en Task 3
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE L1": "ESCUELA PADRE GUSTAVO LE PAIGE L1",
    "ESCUELA N° 1365 PADRE GUSTAVO LE PAIGE L2": "ESCUELA PADRE GUSTAVO LE PAIGE L2",
    "ESCUELA N\u00b0 1365 PADRE GUSTAVO LE PAIGE L1": "ESCUELA PADRE GUSTAVO LE PAIGE L1",
    "ESCUELA N\u00b0 1365 PADRE GUSTAVO LE PAIGE L2": "ESCUELA PADRE GUSTAVO LE PAIGE L2",
    "INSTITUTO CUMBRE DE CONDORES PONIENTE L1": "INSTITUTO CUMBRE DE CONDORES PONIENTE L1",
    "INSTITUTO CUMBRE DE CONDORES PONIENTE L2": "INSTITUTO CUMBRE DE CONDORES PONIENTE L2",
}

SUMMARY_ROWS = {"Válidamente Emitidos", "Total Votación", "Total Votaci\xf3n",
                "V\xe1lidamente Emitidos"}


def _normalize_local(name: str) -> str:
    name = str(name).strip().upper()
    # normalizar encoding artifacts de LAURA VICUÑA
    name = name.replace("VICU\xd1A", "VICUÑA").replace("VICU?A", "VICUÑA")
    return LOCAL_MAP.get(name, name)


def _normalize_candidato(c: str) -> str:
    c = str(c).strip()
    # Match uppercase and title-case variants, with or without trailing spaces
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
    df = pd.read_csv(f"{data_dir}/muni24.csv", encoding="cp1252")
    df = df.rename(columns={"Local": "local", "Candidatos": "candidato", "Votos": "votos",
                             "Partido": "partido"})
    df["pacto"] = df["partido"]
    df["election"] = "muni24"
    return df[["election", "local", "candidato", "votos", "partido", "pacto"]]


def _load_parla25(data_dir: str) -> pd.DataFrame:
    df = pd.read_csv(f"{data_dir}/parla1v.csv", encoding="cp1252")
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


def load_elections(data_dir: str) -> dict:
    """Carga los 4 archivos de elecciones, normaliza y devuelve dict {election_id: DataFrame}.
    Cada DataFrame tiene columnas: local, candidato, votos, partido, pacto.
    Los votos ya están agregados por local (suma de todas las mesas).
    """
    loaders = {
        "muni24":   _load_muni24,
        "parla25":  _load_parla25,
        "pres1v25": _load_pres1v,
        "pres2v25": _load_pres2v,
    }
    result = {}
    for eid, loader in loaders.items():
        df = loader(data_dir)
        df["local"] = df["local"].apply(_normalize_local)
        df["candidato"] = df["candidato"].apply(_normalize_candidato)
        df["partido"] = df["partido"].apply(_normalize_partido)
        df["pacto"] = df["pacto"].fillna("otros").astype(str).str.strip()
        df["votos"] = pd.to_numeric(df["votos"], errors="coerce").fillna(0)
        # Agregar por local + candidato (suma de mesas)
        df = df.groupby(["election", "local", "candidato", "partido", "pacto"],
                        as_index=False)["votos"].sum()
        result[eid] = df
    return result


def load_locales(data_dir: str) -> pd.DataFrame:
    """Carga locales_final.csv. Convierte coordenadas con coma decimal a float."""
    df = pd.read_csv(f"{data_dir}/locales_final.csv", encoding="cp1252")
    df = df.rename(columns={"local_votacion": "local",
                             "Latitude": "lat", "Longitude": "lon"})
    df["lat"] = df["lat"].astype(str).str.replace(",", ".").astype(float)
    df["lon"] = df["lon"].astype(str).str.replace(",", ".").astype(float)
    df["local"] = df["local"].apply(_normalize_local)
    return df[["local", "lat", "lon"]]

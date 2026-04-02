import pandas as pd

def distribute_votes_to_manzanas(elections: dict, weights: pd.DataFrame) -> pd.DataFrame:
    """Distribuye votos de cada local a manzanas según pesos Haversine.

    Args:
        elections: dict {election_id: DataFrame con cols local, candidato, votos, partido, pacto}
        weights: DataFrame con cols mz_id, local, peso

    Returns:
        DataFrame con cols: mz_id, election, candidato, partido, pacto, votos_est, pct
    """
    all_results = []

    for election_id, df in elections.items():
        merged = df.merge(weights, on="local", how="inner")
        merged["votos_est"] = merged["votos"] * merged["peso"]

        agg = merged.groupby(
            ["mz_id", "election", "candidato", "partido", "pacto"],
            as_index=False
        )["votos_est"].sum()

        totals = agg.groupby("mz_id")["votos_est"].sum().reset_index(name="total")
        agg = agg.merge(totals, on="mz_id")
        agg["pct"] = (agg["votos_est"] / agg["total"]).round(6)
        agg = agg.drop(columns="total")

        all_results.append(agg)

    return pd.concat(all_results, ignore_index=True)


def aggregate_to_layer(manzana_results: pd.DataFrame,
                       manzana_to_layer: pd.DataFrame,
                       layer_col: str) -> pd.DataFrame:
    """Agrega resultados de manzanas a una capa superior (UV o macrozona).

    Args:
        manzana_results: DataFrame con cols mz_id, election, candidato, partido, pacto, votos_est
        manzana_to_layer: DataFrame con cols mz_id + layer_col
        layer_col: nombre de la columna de destino (ej: uv_id o mz_macro_id)

    Returns:
        DataFrame con cols: {layer_col}, election, candidato, partido, pacto, votos_est, pct
    """
    merged = manzana_results.merge(manzana_to_layer[["mz_id", layer_col]], on="mz_id")
    agg = merged.groupby(
        [layer_col, "election", "candidato", "partido", "pacto"],
        as_index=False
    )["votos_est"].sum()

    totals = agg.groupby([layer_col, "election"])["votos_est"].sum().reset_index(name="total")
    agg = agg.merge(totals, on=[layer_col, "election"])
    agg["pct"] = (agg["votos_est"] / agg["total"]).round(6)
    return agg.drop(columns="total")

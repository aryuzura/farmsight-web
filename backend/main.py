

from fastapi import FastAPI, HTTPException

from fastapi.middleware.cors import CORSMiddleware

import pandas as pd

import numpy as np

import os



app = FastAPI(title="FarmSight API - CSV Version")



# ============================================================

# KONFIGURASI

# ============================================================



app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)



CSV_DIR = os.path.abspath(

    os.path.join(

        os.path.dirname(__file__),

        "..",

        "farmsight_output",

        "csv"

    )

)





# ============================================================

# HELPER

# ============================================================



def read_csv_data(filename):

    """Membaca CSV dari folder output utama."""

    path = os.path.join(CSV_DIR, filename)



    if not os.path.exists(path):

        raise HTTPException(

            status_code=404,

            detail=f"File {filename} tidak ditemukan di {CSV_DIR}"

        )



    try:

        df = pd.read_csv(path)

        df.columns = df.columns.astype(str).str.strip()

        return df

    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal membaca {filename}: {str(e)}"

        )





def clean_records(df):

    """Membersihkan NaN dan Infinity sebelum mengirim JSON."""

    result = df.replace([np.inf, -np.inf], np.nan)

    result = result.astype(object).where(pd.notna(result), None)

    return result.to_dict(orient="records")





def normalize_code(df):

    """Menyeragamkan kode produk jika kolomnya tersedia."""

    if "kode_produk" in df.columns:

        df["kode_produk"] = (

            df["kode_produk"]

            .astype("string")

            .str.strip()

            .str.upper()

        )

    return df





def numeric_column(df, column):

    """Mengubah kolom menjadi angka jika tersedia."""

    if column in df.columns:

        df[column] = pd.to_numeric(df[column], errors="coerce")

    return df





def get_revenue_column(df):

    """

    Mengenali nama kolom pendapatan.

    Nama pendapatann_transaksi juga didukung karena

    nama kolom tersebut muncul pada hasil pemeriksaan CSV.

    """

    candidates = [

        "pendapatan",

        "pendapatann_transaksi",

        "estimasi_pendapatan"

    ]



    for column in candidates:

        if column in df.columns:

            return column



    return None





def calculate_forecast_revenue():

    """

    Menghitung estimasi pendapatan dari prediksi demand x harga.

    Ini estimasi, bukan pendapatan aktual.

    """

    forecast = read_csv_data("forecast_kedepan.csv")

    produk = read_csv_data("dim_produk.csv")



    forecast = normalize_code(forecast)

    produk = normalize_code(produk)



    required_forecast = {"kode_produk", "minggu_mulai", "prediksi"}

    required_product = {"kode_produk", "harga_satuan"}



    if not required_forecast.issubset(forecast.columns):

        raise HTTPException(

            status_code=500,

            detail="Kolom wajib forecast_kedepan.csv tidak lengkap."

        )



    if not required_product.issubset(produk.columns):

        raise HTTPException(

            status_code=500,

            detail="Kolom wajib dim_produk.csv tidak lengkap."

        )



    forecast = numeric_column(forecast, "prediksi")

    produk = numeric_column(produk, "harga_satuan")



    harga_cols = ["kode_produk", "harga_satuan"]



    if "nama_produk" in produk.columns:

        harga_cols.append("nama_produk")



    harga = (

        produk[ harga_cols ]

        .dropna(subset=["kode_produk"])

        .drop_duplicates(subset=["kode_produk"])

    )



    data = forecast.merge(

        harga,

        on="kode_produk",

        how="left",

        validate="many_to_one"

    )



    data["estimasi_pendapatan"] = (

        data["prediksi"].clip(lower=0) * data["harga_satuan"]

    )



    data = data.dropna(

        subset=["minggu_mulai", "estimasi_pendapatan"]

    )



    return data





# ============================================================

# INVENTORY

# ============================================================



@app.get("/api/inventory")

def get_inventory_data():

    try:

        df = read_csv_data("fact_siklus_stok.csv")



        # Koreksi tanggal jika format kolom ini digunakan.

        if {"order_date", "creation_date"}.issubset(df.columns):

            df["order_date"] = pd.to_datetime(

                df["order_date"], errors="coerce"

            )

            df["creation_date"] = pd.to_datetime(

                df["creation_date"], errors="coerce"

            )



            mask = (

                df["order_date"].notna()

                & df["creation_date"].notna()

                & (df["order_date"] < df["creation_date"])

            )

            df.loc[mask, "order_date"] = df.loc[

                mask, "creation_date"

            ]



            df["order_date"] = (

                df["order_date"].dt.strftime("%Y-%m-%d")

            )

            df["creation_date"] = (

                df["creation_date"].dt.strftime("%Y-%m-%d")

            )



        elif {"tanggal_pesan", "tanggal_produksi"}.issubset(df.columns):

            df["tanggal_pesan"] = pd.to_datetime(

                df["tanggal_pesan"], errors="coerce"

            )

            df["tanggal_produksi"] = pd.to_datetime(

                df["tanggal_produksi"], errors="coerce"

            )



            mask = (

                df["tanggal_pesan"].notna()

                & df["tanggal_produksi"].notna()

                & (df["tanggal_pesan"] < df["tanggal_produksi"])

            )

            df.loc[mask, "tanggal_pesan"] = df.loc[

                mask, "tanggal_produksi"

            ]



            df["tanggal_pesan"] = (

                df["tanggal_pesan"].dt.strftime("%Y-%m-%d")

            )

            df["tanggal_produksi"] = (

                df["tanggal_produksi"].dt.strftime("%Y-%m-%d")

            )



        # Mempertahankan batas respons sebelumnya.

        df = df.tail(500).copy()

        return clean_records(df)



    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal mengambil data inventory: {str(e)}"

        )





# ============================================================

# FORECAST PER PRODUK

# ============================================================



@app.get("/api/forecast")
def get_forecast():
    try:
        produk = normalize_code(read_csv_data("dim_produk.csv"))
        hasil = normalize_code(read_csv_data("hasil_pemodelan.csv"))
        model = normalize_code(read_csv_data("model_terbaik.csv"))
        stok = normalize_code(read_csv_data("safety_stock_rop.csv"))

        if "kode_produk" not in produk.columns:
            raise HTTPException(
                status_code=500,
                detail="Kolom kode_produk tidak tersedia pada dim_produk.csv."
            )

        # dim_produk menjadi daftar utama agar semua produk tetap tampil.
        kolom_produk = [
            c for c in ["kode_produk", "nama_produk", "status_produk"]
            if c in produk.columns
        ]
        hasil_dashboard = (
            produk[kolom_produk]
            .dropna(subset=["kode_produk"])
            .drop_duplicates(subset=["kode_produk"])
            .copy()
        )

        # RMSE dari hasil_pemodelan.csv; kolom Safety_Stock/ROP di file ini
        # diabaikan karena pada file tersebut nilainya kosong.
        if {"kode_produk", "RMSE"}.issubset(hasil.columns):
            hasil_ringkas = hasil[["kode_produk", "RMSE"]].copy()
            hasil_ringkas = hasil_ringkas.drop_duplicates(
                subset=["kode_produk"]
            )
            hasil_dashboard = hasil_dashboard.merge(
                hasil_ringkas,
                on="kode_produk",
                how="left",
                validate="one_to_one"
            )

        # Metrik dan model terbaik hanya tersedia untuk produk yang dimodelkan.
        kolom_model = [
            c for c in [
                "kode_produk",
                "model_terbaik",
                "rmse",
                "mae",
                "mase",
                "tier_model",
                "keandalan",
                "catatan_keandalan",
            ]
            if c in model.columns
        ]

        if len(kolom_model) > 1:
            model_ringkas = (
                model[kolom_model]
                .dropna(subset=["kode_produk"])
                .drop_duplicates(subset=["kode_produk"])
                .copy()
                .rename(columns={"rmse": "RMSE_model"})
            )

            hasil_dashboard = hasil_dashboard.merge(
                model_ringkas,
                on="kode_produk",
                how="left",
                validate="one_to_one"
            )

            # Gunakan RMSE model bila ada, lalu fallback ke hasil_pemodelan.
            if "RMSE_model" in hasil_dashboard.columns:
                if "RMSE" in hasil_dashboard.columns:
                    hasil_dashboard["RMSE"] = hasil_dashboard[
                        "RMSE_model"
                    ].combine_first(hasil_dashboard["RMSE"])
                else:
                    hasil_dashboard["RMSE"] = hasil_dashboard["RMSE_model"]

                hasil_dashboard.drop(
                    columns=["RMSE_model"],
                    inplace=True
                )

        # SS/ROP berasal dari safety_stock_rop.csv.
        kolom_stok = [
            c for c in [
                "kode_produk",
                "safety_stock",
                "reorder_point",
                "tier_model",
                "keandalan",
                "metode_dasar",
                "d_rata_minggu",
                "lead_time_minggu",
            ]
            if c in stok.columns
        ]

        if len(kolom_stok) > 1:
            stok_ringkas = (
                stok[kolom_stok]
                .dropna(subset=["kode_produk"])
                .drop_duplicates(subset=["kode_produk"])
                .copy()
                .rename(columns={
                    "safety_stock": "Safety_Stock",
                    "reorder_point": "ROP",
                    "tier_model": "tier_model_stok",
                    "keandalan": "keandalan_stok",
                })
            )

            hasil_dashboard = hasil_dashboard.merge(
                stok_ringkas,
                on="kode_produk",
                how="left",
                validate="one_to_one"
            )

            # Isi tier/keandalan dari data SS/ROP jika model tidak menyediakannya.
            for target, source in [
                ("tier_model", "tier_model_stok"),
                ("keandalan", "keandalan_stok"),
            ]:
                if source in hasil_dashboard.columns:
                    if target in hasil_dashboard.columns:
                        hasil_dashboard[target] = (
                            hasil_dashboard[target].combine_first(
                                hasil_dashboard[source]
                            )
                        )
                    else:
                        hasil_dashboard[target] = hasil_dashboard[source]

                    hasil_dashboard.drop(columns=[source], inplace=True)

        # Kolom ini selalu disediakan agar bentuk respons konsisten untuk React.
        kolom_dashboard = [
            "kode_produk",
            "nama_produk",
            "status_produk",
            "RMSE",
            "model_terbaik",
            "mae",
            "mase",
            "tier_model",
            "keandalan",
            "catatan_keandalan",
            "Safety_Stock",
            "ROP",
            "metode_dasar",
            "d_rata_minggu",
            "lead_time_minggu",
        ]

        for column in kolom_dashboard:
            if column not in hasil_dashboard.columns:
                hasil_dashboard[column] = None

        return clean_records(hasil_dashboard[kolom_dashboard])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal mengambil data forecast: {str(e)}"
        )





@app.get("/api/dashboard/kpi")

def get_dashboard_kpi():

    try:

        harian = read_csv_data("fact_demand_harian.csv")

        produk = read_csv_data("dim_produk.csv")



        harian = normalize_code(harian)

        produk = normalize_code(produk)



        # Pendapatan historis.

        kolom_pendapatan = get_revenue_column(harian)

        total_pendapatan = None



        if kolom_pendapatan:

            nilai = pd.to_numeric(

                harian[kolom_pendapatan], errors="coerce"

            ).dropna()



            if not nilai.empty:

                total_pendapatan = round(float(nilai.sum()), 2)



        # Jangan mengasumsikan jumlah baris = jumlah transaksi.

        total_transaksi = None

        if "n_transaksi" in harian.columns:

            transaksi = pd.to_numeric(

                harian["n_transaksi"], errors="coerce"

            ).dropna()



            if not transaksi.empty:

                total_transaksi = int(transaksi.sum())



        total_produk = (

            int(produk["kode_produk"].nunique())

            if "kode_produk" in produk.columns else None

        )



        produk_aktif = None

        produk_tidak_aktif = None



        if "status_produk" in produk.columns:

            status = (

                produk["status_produk"]

                .astype("string")

                .str.strip()

                .str.lower()

            )



            produk_aktif = int((status == "aktif").sum())

            produk_tidak_aktif = int(

                status.str.startswith("tidak_aktif", na=False).sum()

            )



        # Estimasi pendapatan dari forecast demand x harga.

        data_forecast = calculate_forecast_revenue()

        total_forecast_pendapatan = None



        if not data_forecast.empty:

            total_forecast_pendapatan = round(

                float(data_forecast["estimasi_pendapatan"].sum()),

                2

            )



        return {

            "status": "berhasil",

            "total_produk": total_produk,

            "produk_aktif": produk_aktif,

            "produk_tidak_aktif": produk_tidak_aktif,

            "total_transaksi": total_transaksi,

            "total_pendapatan": total_pendapatan,

            "total_forecast_pendapatan": total_forecast_pendapatan,

            "skor_kesehatan_bisnis": None,

            "label_kesehatan_bisnis": "Belum dapat dihitung",

            "komponen_skor_kesehatan_bisnis": [],

            "catatan": [

                "Jumlah transaksi tidak ditampilkan jika kolom transaksi tidak tersedia.",

                "Pendapatan historis mengikuti kolom pendapatan pada sumber data.",

                "Pendapatan forecast merupakan estimasi demand dikali harga, bukan pendapatan aktual.",

                "Skor kesehatan bisnis belum dihitung karena rumus dan komponen berbobot belum ditetapkan."

            ]

        }



    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal menghitung KPI dashboard: {str(e)}"

        )





# ============================================================

# TREN PENJUALAN

# ============================================================



@app.get("/api/dashboard/tren-penjualan")

def get_dashboard_tren_penjualan():

    try:

        df = read_csv_data("fact_demand_harian.csv")



        kolom_pendapatan = get_revenue_column(df)



        if "tanggal" not in df.columns:

            raise HTTPException(

                status_code=500,

                detail="Kolom tanggal tidak tersedia pada data harian."

            )



        df["tanggal"] = pd.to_datetime(

            df["tanggal"], errors="coerce"

        )

        df = df.dropna(subset=["tanggal"]).copy()



        # Grafik menggunakan format tanggal yang konsisten.

        df["tanggal"] = df["tanggal"].dt.strftime("%Y-%m-%d")



        if "demand" in df.columns:

            df["demand"] = pd.to_numeric(

                df["demand"], errors="coerce"

            )



        if kolom_pendapatan:

            df["pendapatan"] = pd.to_numeric(

                df[kolom_pendapatan], errors="coerce"

            )

        else:

            df["pendapatan"] = np.nan



        # n_transaksi hanya disertakan jika benar-benar tersedia.

        kolom_agregasi = {}



        if "demand" in df.columns:

            kolom_agregasi["demand"] = ("demand", "sum")



        if "pendapatan" in df.columns:

            kolom_agregasi["pendapatan"] = ("pendapatan", "sum")



        if "n_transaksi" in df.columns:

            df["n_transaksi"] = pd.to_numeric(

                df["n_transaksi"], errors="coerce"

            )

            kolom_agregasi["n_transaksi"] = ("n_transaksi", "sum")



        if not kolom_agregasi:

            raise HTTPException(

                status_code=500,

                detail="Tidak ada kolom numerik untuk tren penjualan."

            )



        tren = (

            df.groupby("tanggal", as_index=False)

            .agg(**kolom_agregasi)

            .sort_values("tanggal")

        )



        return clean_records(tren)



    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal mengambil tren penjualan: {str(e)}"

        )





# ============================================================

# FORECAST PENDAPATAN

# ============================================================



@app.get("/api/dashboard/forecast-pendapatan")

def get_dashboard_forecast_pendapatan():

    try:

        data = calculate_forecast_revenue()



        if data.empty:

            return []



        mingguan = (

            data.groupby("minggu_mulai", as_index=False)

            .agg(

                estimasi_pendapatan=("estimasi_pendapatan", "sum"),

                total_prediksi_demand=("prediksi", "sum"),

                jumlah_produk=("kode_produk", "nunique")

            )

            .sort_values("minggu_mulai")

        )



        mingguan["estimasi_pendapatan"] = (

            mingguan["estimasi_pendapatan"].round(2)

        )

        mingguan["total_prediksi_demand"] = (

            mingguan["total_prediksi_demand"].round(4)

        )



        return clean_records(mingguan)



    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal menghitung forecast pendapatan: {str(e)}"

        )





# ============================================================

# RINGKASAN PRODUK

# ============================================================



@app.get("/api/dashboard/produk")

def get_dashboard_produk():

    try:

        produk = normalize_code(read_csv_data("dim_produk.csv"))

        harian = normalize_code(read_csv_data("fact_demand_harian.csv"))



        if "kode_produk" not in produk.columns:

            raise HTTPException(

                status_code=500,

                detail="Kolom kode_produk tidak tersedia pada dim_produk.csv."

            )



        # Satu baris per produk.

        kolom_produk = [

            c for c in [

                "kode_produk",

                "nama_produk",

                "kategori",

                "status_produk",

                "satuan_produk",

                "total_demand",

                "n_transaksi",

                "harga_satuan",

                "tanggal_terakhir_jual",

                "minggu_sejak_terakhir_jual"

            ]

            if c in produk.columns

        ]



        ringkasan = (

            produk[kolom_produk]

            .drop_duplicates("kode_produk")

            .copy()

        )



        # Hitung demand aktual dari data harian jika tersedia.

        if {"kode_produk", "demand"}.issubset(harian.columns):

            harian["demand"] = pd.to_numeric(

                harian["demand"], errors="coerce"

            )



            demand_produk = (

                harian.groupby("kode_produk", as_index=False)

                .agg(unit_terjual=("demand", "sum"))

            )



            ringkasan = ringkasan.merge(

                demand_produk,

                on="kode_produk",

                how="left"

            )

        else:

            ringkasan["unit_terjual"] = None



        # Hitung pendapatan historis per produk jika tersedia.

        kolom_pendapatan = get_revenue_column(harian)



        if kolom_pendapatan:

            harian[kolom_pendapatan] = pd.to_numeric(

                harian[kolom_pendapatan], errors="coerce"

            )



            pendapatan_produk = (

                harian.groupby("kode_produk", as_index=False)

                .agg(

                    pendapatan=(kolom_pendapatan, "sum")

                )

            )



            ringkasan = ringkasan.merge(

                pendapatan_produk,

                on="kode_produk",

                how="left"

            )

        else:

            ringkasan["pendapatan"] = None



        # Field nama yang digunakan Dashboard.jsx.

        if "nama_produk" in ringkasan.columns:

            ringkasan["nama"] = ringkasan["nama_produk"]



        return clean_records(ringkasan)



    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal mengambil ringkasan produk: {str(e)}"

        )





# ============================================================

# SKOR / INDIKATOR OPERASIONAL

# ============================================================



@app.get("/api/dashboard/skor-operasional")

def get_dashboard_skor_operasional():

    try:

        df = read_csv_data("fact_siklus_stok.csv")



        kolom_wajib = [

            "jumlah_produk_masuk",

            "demand_aktual_siklus"

        ]



        kolom_hilang = [

            kolom for kolom in kolom_wajib

            if kolom not in df.columns

        ]



        if kolom_hilang:

            raise HTTPException(

                status_code=500,

                detail=f"Kolom tidak ditemukan: {kolom_hilang}"

            )



        stok = pd.to_numeric(

            df["jumlah_produk_masuk"], errors="coerce"

        )

        demand = pd.to_numeric(

            df["demand_aktual_siklus"], errors="coerce"

        )



        valid = (

            stok.notna()

            & demand.notna()

            & np.isfinite(stok)

            & np.isfinite(demand)

        )



        if not valid.any():

            return {

                "status": "perlu_data",

                "total_siklus": 0,

                "total_stok_masuk": None,

                "total_demand": None,

                "stok_tidak_terserap": None,

                "utilisasi_persen": None,

                "stok_tidak_terserap_persen": None,

                "skor_operasional": None,

                "catatan": [

                    "Tidak ada baris dengan stok masuk dan demand valid."

                ]

            }



        total_stok = float(stok[valid].sum())

        total_demand = float(demand[valid].sum())

        selisih = total_stok - total_demand



        utilisasi = (

            total_demand / total_stok * 100

            if total_stok > 0 else None

        )



        # Indikator utilisasi dibatasi maksimum 100.

        # Ini bukan skor kesehatan bisnis berbobot.

        skor = (

            min(max(utilisasi, 0.0), 100.0)

            if utilisasi is not None else None

        )



        return {

            "status": "berhasil",

            "total_siklus": int(valid.sum()),

            "total_stok_masuk": round(total_stok, 2),

            "total_demand": round(total_demand, 2),

            "stok_tidak_terserap": round(selisih, 2),

            "utilisasi_persen": (

                round(utilisasi, 2)

                if utilisasi is not None else None

            ),

            "stok_tidak_terserap_persen": (

                round(selisih / total_stok * 100, 2)

                if total_stok > 0 else None

            ),

            "skor_operasional": (

                round(skor, 2)

                if skor is not None else None

            ),

            "catatan": [

                "Agregat dihitung dari catatan siklus stok, bukan saldo gudang saat ini.",

                "Utilisasi adalah rasio demand terhadap stok masuk.",

                "Skor ini hanya indikator utilisasi, bukan skor kesehatan bisnis berbobot."

            ]

        }



    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Gagal menghitung indikator operasional: {str(e)}"

        )
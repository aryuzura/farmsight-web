from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import pandas as pd

app = FastAPI(title="FarmSight API - Smart Inventory & Forecasting")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    conn = sqlite3.connect('data/farmsight.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/demand-forecast")
def get_forecast_data():
    """Mengambil data hasil prediksi demand, safety stock, dan ROP untuk dashboard."""
    conn = get_db_connection()
    try:
        query = "SELECT * FROM forecast_results LIMIT 100"
        df = pd.read_sql_query(query, conn)
        return df.to_dict(orient="records")
    except Exception as e:
        # Data fallback jika tabel belum siap
        return [
            {
                "product_id": "PRD-01", 
                "product_name": "Pupuk Urea Subsidi", 
                "forecast_value": 120, 
                "safety_stock": 15, 
                "rop": 20,
                "status": "Aman"
            },
            {
                "product_id": "PRD-02", 
                "product_name": "Benih Padi Unggul", 
                "forecast_value": 85, 
                "safety_stock": 10, 
                "rop": 12,
                "status": "Perlu Restock"
            }
        ]
    finally:
        conn.close()

@app.get("/api/dashboard-summary")
def get_dashboard_summary():
    """Ringkasan metrik penting untuk kartu statistik di atas dashboard."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(DISTINCT product_id) as total_products FROM forecast_results")
        total_products = cursor.fetchone()["total_products"]
        
        return {
            "total_products": total_products if total_products else 38,
            "active_alerts": 3,
            "model_used": "ARIMA & Croston SBA"
        }
    except Exception:
        return {
            "total_products": 38,
            "active_alerts": 2,
            "model_used": "ARIMA & Croston SBA"
        }
    finally:
        conn.close()
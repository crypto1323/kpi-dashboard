"""院別 月間KPIダッシュボード（シングルページ）

起動方法:
    pip install -r requirements.txt
    streamlit run app.py

CRM の「月間報告書」Excel（.xls / .xlsx）をアップロードすると、
「窓口売上」「来院人数」「純患者数(内訳)」「初診率・継続率」「施術分類」などのシート
（見つからなければ「月間報告書【全体１】」）から主要項目を自動で取り出し、
目標値と比べた差額・進捗率を1画面で表示する。
"""

import calendar
import hashlib
import hmac
import html
import io
import json
import os
import threading
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

st.set_page_config(page_title="月間KPIダッシュボード", page_icon="📊", layout="wide")

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------
SUM = "合計"   # 積み上がる数値（売上・人数）：日割りの基準で進捗を判定
MEAN = "平均"  # 率・単価・平均値：目標値そのものと比較

SUPPORTED_EXTS = ["xls", "xlsx", "csv"]
EXCEL_ENGINES = {".xlsx": "openpyxl", ".xls": "xlrd"}

# 全員で共有するデータの保存先
#   .streamlit/secrets.toml に [supabase] の url と key があれば Supabase（クラウドのデータベース）に保存する。
#   無い場合はこのPCの data フォルダに保存する（ローカルで動かすとき用。クラウドでは再起動で消える）。
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
LOCAL_UPLOAD_DIR = BASE_DIR / "uploads"       # 以前の版でアップロードされた報告書（クラウドへの移行元）
LEGACY_DIR = BASE_DIR / ".dashboard_state"    # さらに前の版の保存先（移行元）
STORE_TABLE = "app_store"                     # 目標・設定（キーと JSON）
REPORT_TABLE = "kpi_reports"                  # 報告書から抽出した数値（院・月ごとに1行）

ALL_CLINICS = "全院合計"
TOTAL_WORDS = {"合計", "小計", "総計", "計"}

# 判定と色（緑＝達成、青＝ペース内、赤＝遅れ）
ST_DONE, ST_ONTRACK, ST_BEHIND, ST_NOTARGET, ST_MISSING = "達成", "順調", "遅れ", "目標未設定", "未検出"
STATUS_STYLE = {
    ST_DONE: ("#2e7d32", "🟢 達成"),
    ST_ONTRACK: ("#1565c0", "🔵 順調"),
    ST_BEHIND: ("#c62828", "🔴 遅れ"),
    ST_NOTARGET: ("#9e9e9e", "⚪ 目標未設定"),
    ST_MISSING: ("#ef6c00", "⚠️ 未検出"),
}
SALES_COLORS = {"保険": "#4e79a7", "混合": "#b07aa1", "自費": "#f28e2b", "物販": "#59a14f"}


# ---------------------------------------------------------------------------
# 抽出する項目の定義
#   lookups は上から順に試し、最初に値が取れたものを使う。
#   ("cross", シート名に含む文字, 基準ラベル, 行ラベル, 列ラベル)  … 行と列が交わるセル
#   ("right", シート名に含む文字, 基準ラベル, ラベル, None)        … ラベルの右にある最初の数値
# ---------------------------------------------------------------------------
def _sales_items() -> list[dict]:
    items = []
    for patient in ["全体", "新患", "再診", "継続"]:
        for col, base in [("合計", "窓口売上合計"), ("保険", "保険売上"), ("混合", "混合売上"), ("自費", "自費売上"), ("物販", "物販売上")]:
            items.append(
                {
                    "name": base if patient == "全体" else f"{base}（{patient}）",
                    "category": "窓口売上" if patient == "全体" else "患者区分別の売上",
                    "unit": "円",
                    "agg": SUM,
                    "lookups": [
                        ("cross", "窓口売上", None, patient, col),
                        ("cross", "全体1", "窓口売上", patient, col),
                    ],
                }
            )
    return items


CATALOG: list[dict] = _sales_items() + [
    # 単価
    {"name": "窓口金単価", "category": "単価・平均", "unit": "円", "agg": MEAN,
     "lookups": [("cross", "窓口売上", None, "全体", "窓口金単価"), ("cross", "全体1", "窓口売上", "全体", "窓口金単価")]},
    {"name": "自費単価", "category": "単価・平均", "unit": "円", "agg": MEAN,
     "lookups": [("cross", "窓口売上", None, "全体", "自費単価"), ("cross", "全体1", "窓口売上", "全体", "自費単価")]},
    # 患者数
    {"name": "延べ来院数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "来院人数", None, "合計", "人数"), ("cross", "全体1", "来院人数", "合計", "人数")]},
    {"name": "純患者数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "純患者数", None, "純患者数", "当月"), ("cross", "全体1", "純患者数(内訳)", "純患者数", "当月")]},
    {"name": "新患数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "純患者数", None, "新患人数", "当月"), ("cross", "全体1", "純患者数(内訳)", "新患人数", "当月")]},
    {"name": "再診数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "純患者数", None, "再診人数", "当月"), ("cross", "全体1", "純患者数(内訳)", "再診人数", "当月")]},
    {"name": "継続患者数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "純患者数", None, "継続人数", "当月"), ("cross", "全体1", "純患者数(内訳)", "継続人数", "当月")]},
    {"name": "午前来院数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "来院人数", None, "午前", "人数"), ("cross", "全体1", "来院人数", "午前", "人数")]},
    {"name": "午後来院数", "category": "患者数", "unit": "人", "agg": SUM,
     "lookups": [("cross", "来院人数", None, "午後", "人数"), ("cross", "全体1", "来院人数", "午後", "人数")]},
    # 率（報告書の 0.545 → 54.5%）
    {"name": "初診率（新患1→2回目）", "category": "初診率・継続率", "unit": "%", "agg": MEAN, "pct": True,
     "lookups": [("cross", "初診率", "新患", "比率", "1-2"), ("cross", "全体1", None, "初診率1-2", "%")]},
    {"name": "継続率（新患2→3回目）", "category": "初診率・継続率", "unit": "%", "agg": MEAN, "pct": True,
     "lookups": [("cross", "初診率", "新患", "比率", "2-3"), ("cross", "全体1", None, "継続率2-3", "%")]},
    {"name": "継続率（新患3→4回目）", "category": "初診率・継続率", "unit": "%", "agg": MEAN, "pct": True,
     "lookups": [("cross", "初診率", "新患", "比率", "3-4"), ("cross", "全体1", None, "継続率3-4", "%")]},
    {"name": "再診の戻り率（1→2回目）", "category": "初診率・継続率", "unit": "%", "agg": MEAN, "pct": True,
     "lookups": [("cross", "初診率", "再診", "比率", "1-2")]},
    {"name": "継続患者の戻り率（1→2回目）", "category": "初診率・継続率", "unit": "%", "agg": MEAN, "pct": True,
     "lookups": [("cross", "初診率", "継続", "比率", "1-2")]},
    # 平均値
    {"name": "平均通院回数", "category": "単価・平均", "unit": "回", "agg": MEAN,
     "lookups": [("right", "全体1", None, "平均通院回数", None)]},
    {"name": "平均滞在時間", "category": "単価・平均", "unit": "分", "agg": MEAN,
     "lookups": [("right", "全体1", None, "平均滞在時間", None)]},
    {"name": "1日平均来院数", "category": "単価・平均", "unit": "人", "agg": MEAN,
     "lookups": [("right", "全体1", None, "全日(平均)", None)]},
]
CATALOG_SIG = hashlib.md5(repr(CATALOG).encode("utf-8")).hexdigest()
CATEGORY_ORDER = ["窓口売上", "患者数", "初診率・継続率", "単価・平均", "患者区分別の売上", "追加項目"]

# サマリーに大きく出す項目
HEADLINE_ITEMS = ["窓口売上合計", "自費売上", "新患数", "延べ来院数"]
SECONDARY_ITEMS = ["初診率（新患1→2回目）", "継続率（新患2→3回目）", "窓口金単価", "平均通院回数"]

# 初期値の目標（仮の値。画面の表で自由に書き換える）
DEFAULT_TARGETS = {
    "窓口売上合計": 3_000_000, "保険売上": 350_000, "自費売上": 1_000_000, "物販売上": 50_000,
    "延べ来院数": 450, "純患者数": 230, "新患数": 30,
    "初診率（新患1→2回目）": 60, "継続率（新患2→3回目）": 50,
    "窓口金単価": 6_500, "平均通院回数": 2.0,
}

CUSTOM_COLUMNS = ["項目名", "単位", "集計", "シート名", "基準ラベル", "行ラベル", "列ラベル", "割合を%に"]


# ---------------------------------------------------------------------------
# セル値のユーティリティ
# ---------------------------------------------------------------------------
def is_blank(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip()
    try:
        return bool(pd.isna(v))
    except (TypeError, ValueError):
        return False


def norm_text(v) -> str:
    """ラベル比較用の正規化（全角半角・空白・コロンの違いを吸収）。"""
    s = unicodedata.normalize("NFKC", str(v))
    return re.sub(r"\s+", "", s).strip(":").lower()


def parse_number(v) -> float | None:
    """セルの値を数値に変換する。「1,234円」「△500」「41.2%」にも対応。数値でなければ None。"""
    if isinstance(v, (bool, np.bool_)):
        return None
    if isinstance(v, (int, float, np.integer, np.floating)):
        return None if pd.isna(v) else float(v)
    if not isinstance(v, str):
        return None
    s = unicodedata.normalize("NFKC", v).strip()
    if not s:
        return None
    neg = s[0] in "△▲-−" and len(s) > 1
    if neg:
        s = s[1:]
    s = re.sub(r"[,\s円¥%人回分件]", "", s)
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return -float(s) if neg else float(s)
    return None


def col_letter(c: int) -> str:
    s, n = "", c + 1
    while n:
        n, rem = divmod(n - 1, 26)
        s = chr(65 + rem) + s
    return s


# ---------------------------------------------------------------------------
# ファイル読み込みと全セルの走査
# ---------------------------------------------------------------------------
@st.cache_data
def read_grids(raw: bytes, filename: str) -> dict[str, np.ndarray]:
    """全シートを見出し無しの2次元配列として読み込む。"""
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        import csv

        for enc in ("utf-8-sig", "cp932"):
            try:
                rows = list(csv.reader(io.StringIO(raw.decode(enc))))
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("CSVの文字コードを判別できませんでした（UTF-8 または Shift_JIS で保存してください）。")
        width = max((len(r) for r in rows), default=0)
        return {"CSV": np.array([r + [None] * (width - len(r)) for r in rows], dtype=object).reshape(len(rows), width)}
    if ext not in EXCEL_ENGINES:
        raise ValueError(f"対応していないファイル形式です（{ext}）。.xls / .xlsx をアップロードしてください。")
    engine = EXCEL_ENGINES[ext]
    try:
        sheets = pd.read_excel(io.BytesIO(raw), sheet_name=None, header=None, dtype=object, engine=engine)
    except ImportError as e:
        raise ValueError(f"Excelの読み込みに必要な「{engine}」がありません。`pip install {engine}` を実行してください。") from e
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"Excelファイルとして読み込めませんでした（{type(e).__name__}）。ファイルが壊れていないか確認してください。") from e
    return {str(name): sdf.to_numpy(dtype=object) for name, sdf in sheets.items()}


@st.cache_data
def grid_cells(raw: bytes, filename: str) -> dict[str, list[tuple[int, int, str]]]:
    """シートごとに、文字が入っているセルの (行, 列, 正規化した文字) 一覧を作る。"""
    out = {}
    for sheet, grid in read_grids(raw, filename).items():
        out[sheet] = [(r, c, norm_text(v)) for (r, c), v in np.ndenumerate(grid) if isinstance(v, str) and v.strip()]
    return out


def find_cells(cells, label: str, row_range: tuple[int, int] | None = None) -> list[tuple[int, int]]:
    """ラベルに一致するセル。完全一致を優先し、無ければ部分一致。"""
    key = norm_text(label)
    pool = [(r, c, n) for r, c, n in cells if row_range is None or row_range[0] <= r <= row_range[1]]
    exact = [(r, c) for r, c, n in pool if n == key]
    return exact or [(r, c) for r, c, n in pool if key in n]


def lookup_cross(grid, cells, anchor, row_label, col_label):
    """行ラベルと列ラベル（行より上にある見出し）が交わるセルの数値を探す。"""
    anchor_pos, row_range = None, None
    if anchor:
        found = find_cells(cells, anchor)
        if not found:
            return None
        anchor_pos = found[0]
        row_range = (anchor_pos[0], anchor_pos[0] + 40)
    rows = find_cells(cells, row_label, row_range)
    headers = find_cells(cells, col_label, row_range)
    best = None
    for r, rc in rows:
        for hr, hc in headers:
            if not (hr < r <= hr + 12 and hc > rc):
                continue
            v = parse_number(grid[r, hc])
            if v is None:
                continue
            closeness = (r - hr) + (hc - rc)
            tie = abs(r - anchor_pos[0]) + abs(rc - anchor_pos[1]) if anchor_pos else r * 1000 + rc
            key = (closeness, tie)
            if best is None or key < best[0]:
                best = (key, v, (r, hc))
    return None if best is None else (best[1], best[2])


def lookup_right(grid, cells, anchor, label):
    """ラベルの右にある最初の数値。"""
    for r, c in find_cells(cells, label):
        for cc in range(c + 1, min(c + 16, grid.shape[1])):
            v = parse_number(grid[r, cc])
            if v is not None:
                return v, (r, cc)
    return None


def sheets_matching(names, hint: str | None) -> list[str]:
    if not hint:
        return list(names)
    key = norm_text(hint)
    return [s for s in names if key in norm_text(s)]


def read_breakdown(grids, cells_by_sheet) -> pd.DataFrame:
    """「施術分類」の一覧（分類・人数・売上）を読む。専用シート → 全体１ の順。"""
    for hint, name_labels in (("施術分類", ["施術分類"]), ("全体1", ["分類"])):
        for sheet in sheets_matching(grids, hint):
            grid, cells = grids[sheet], cells_by_sheet[sheet]
            for name_label in name_labels:
                for r, c in find_cells(cells, name_label):
                    row_cells = [(cc, n) for rr, cc, n in cells if rr == r and cc > c]
                    col_people = next((cc for cc, n in row_cells if n == "人数"), None)
                    col_sales = next((cc for cc, n in row_cells if n.startswith("売上")), None)
                    if col_people is None or col_sales is None:
                        continue
                    rows = []
                    for rr in range(r + 1, min(r + 200, grid.shape[0])):
                        name = grid[rr, c]
                        if is_blank(name):
                            if rows:
                                break
                            continue
                        label = unicodedata.normalize("NFKC", str(name)).strip()
                        if norm_text(label) in TOTAL_WORDS:
                            break
                        if "未表示" in label:
                            label = "その他（未表示分）"  # 全体１では下位の分類がまとめて表示される
                        elif "合計" in label:
                            continue
                        rows.append(
                            {
                                "分類": label,
                                "人数": parse_number(grid[rr, col_people]) or 0.0,
                                "売上": parse_number(grid[rr, col_sales]) or 0.0,
                            }
                        )
                    if rows:
                        return pd.DataFrame(rows)
    return pd.DataFrame(columns=["分類", "人数", "売上"])


# ---------------------------------------------------------------------------
# 対象期間・対象院の検出
# ---------------------------------------------------------------------------
_D = r"(\d{4})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?\s*(?:\([^)]*\))?"
RANGE_RE = re.compile(_D + r"\s*(?:~|〜|～|－|-|ー|―|から)\s*(?:(\d{4})\s*[/\-.年]\s*)?(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?")
MONTH_RE = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d)")


def safe_date(y, m, d) -> date | None:
    try:
        return date(int(y), int(m), int(d))
    except (TypeError, ValueError):
        return None


def month_bounds(y: int, m: int) -> tuple[date, date] | None:
    if not 1 <= int(m) <= 12:
        return None
    return date(int(y), int(m), 1), date(int(y), int(m), calendar.monthrange(int(y), int(m))[1])


@st.cache_data
def detect_period(raw: bytes, filename: str) -> dict | None:
    """「対象期間 2026/08/01 ～ 2026/08/31」→「2026 年 08 月度」（表紙）→「2026年8月」の順に探す。"""
    grids = read_grids(raw, filename)
    for sheet, grid in grids.items():
        for (r, c), v in np.ndenumerate(grid):
            if isinstance(v, str) and (m := RANGE_RE.search(unicodedata.normalize("NFKC", v))):
                y1, m1, d1, y2, m2, d2 = m.groups()
                s, e = safe_date(y1, m1, d1), safe_date(y2 or y1, m2, d2)
                if s and e:
                    return {"start": min(s, e), "end": max(s, e), "where": f"{sheet}!{col_letter(c)}{r + 1}"}
    for sheet, grid in grids.items():  # 表紙：「2026」「年」「08」「月度」が別々のセル
        for (r, c), v in np.ndenumerate(grid):
            if isinstance(v, str) and norm_text(v) == "年":
                left = [parse_number(grid[r, cc]) for cc in range(max(0, c - 12), c)]
                right = [parse_number(grid[r, cc]) for cc in range(c + 1, min(c + 12, grid.shape[1]))]
                y = next((x for x in reversed(left) if x and 2000 <= x <= 2100), None)
                mo = next((x for x in right if x and 1 <= x <= 12), None)
                if y and mo and (b := month_bounds(int(y), int(mo))):
                    return {"start": b[0], "end": b[1], "where": f"{sheet}!{col_letter(c)}{r + 1}"}
    for sheet, grid in grids.items():
        for (r, c), v in np.ndenumerate(grid):
            if isinstance(v, str) and (m := MONTH_RE.search(unicodedata.normalize("NFKC", v))):
                if b := month_bounds(*m.groups()):
                    return {"start": b[0], "end": b[1], "where": f"{sheet}!{col_letter(c)}{r + 1}"}
    return None


def detect_clinic(grids, cells_by_sheet, filename: str) -> str:
    for sheet, cells in cells_by_sheet.items():
        for r, c in find_cells(cells, "対象院"):
            grid = grids[sheet]
            for cc in range(c + 1, min(c + 15, grid.shape[1])):
                v = grid[r, cc]
                if isinstance(v, str) and v.strip() and "${" not in v:
                    return v.strip()
    return Path(filename).stem


# ---------------------------------------------------------------------------
# 1ファイル分の抽出
# ---------------------------------------------------------------------------
def build_catalog(custom: tuple) -> list[dict]:
    catalog = [dict(x) for x in CATALOG]
    for name, unit, agg, sheet, anchor, row, col, pct in custom:
        spec = {
            "name": name,
            "category": "追加項目",
            "unit": unit,
            "agg": agg,
            "pct": bool(pct),
            "lookups": [("cross" if col else "right", sheet or None, anchor or None, row, col or None)],
        }
        existing = next((x for x in catalog if x["name"] == name), None)
        if existing:  # 同名の項目は、追加した探し方を先に試す
            existing["lookups"] = spec["lookups"] + existing["lookups"]
        else:
            catalog.append(spec)
    return catalog


@st.cache_data
def extract_file(raw: bytes, filename: str, custom: tuple, catalog_sig: str) -> dict:
    """catalog_sig は項目定義が変わったときにキャッシュを作り直すためのキー。"""
    grids = read_grids(raw, filename)
    cells = grid_cells(raw, filename)
    values = {}
    for spec in build_catalog(custom):
        got = None
        for kind, hint, anchor, row, col in spec["lookups"]:
            for sheet in sheets_matching(grids, hint):
                if kind == "cross":
                    res = lookup_cross(grids[sheet], cells[sheet], anchor, row, col)
                else:
                    res = lookup_right(grids[sheet], cells[sheet], anchor, row)
                if res:
                    (r, c) = res[1]
                    got = (res[0], f"{sheet}!{col_letter(c)}{r + 1}")
                    break
            if got:
                break
        if got:
            v = got[0] * 100 if spec.get("pct") and abs(got[0]) <= 1.5 else got[0]
            values[spec["name"]] = {"value": v, "found": True, "where": got[1]}
        else:
            values[spec["name"]] = {"value": 0.0, "found": False, "where": ""}
    return {
        "values": values,
        "period": detect_period(raw, filename),
        "clinic": detect_clinic(grids, cells, filename),
        "breakdown": read_breakdown(grids, cells),
    }


# ---------------------------------------------------------------------------
# サンプルの月間報告書（実際の帳票と同じシート構成）
# ---------------------------------------------------------------------------
def make_sample_report(start: date, end: date, perf: float, clinic: str = "サンプル整骨院") -> bytes | None:
    try:
        from openpyxl import Workbook
    except ImportError:
        return None
    frac = ((end - start).days + 1) / calendar.monthrange(start.year, start.month)[1]
    k = frac * perf
    sales = {  # 患者区分 × 区分（保険・混合・自費・物販）
        "新患": [int(38_000 * k), int(80_000 * k), int(230_000 * k), int(3_000 * k)],
        "再診": [int(10_000 * k), int(2_000 * k), int(12_000 * k), 0],
        "継続": [int(270_000 * k), int(1_550_000 * k), int(640_000 * k), int(30_000 * k)],
    }
    sales["全体"] = [sum(x) for x in zip(*sales.values())]
    people = {"新患": int(25 * k), "再診": int(12 * k), "継続": int(185 * k)}
    visits_am, visits_pm = int(200 * k), int(230 * k)
    wb = Workbook()
    cover = wb.active
    cover.title = "表紙"
    cover["A14"] = "月間報告書"
    cover["V19"], cover["AF19"], cover["AJ19"], cover["AP19"] = start.year, "年", f"{start.month:02d}", "月度"

    ws = wb.create_sheet("月間報告書【全体１】")
    ws["A1"], ws["AR1"], ws["AY1"] = "月間報告書【全体１】", "対象期間", f"{start:%Y/%m/%d} ～ {end:%Y/%m/%d}"
    ws["AR2"], ws["AY2"] = "対象院", clinic
    ws["B36"], ws["C36"] = "●", "最高値・最低値・平均"
    for row, (label, value) in enumerate(
        [("全日(平均）", round((visits_am + visits_pm) / max(1, (end - start).days + 1), 1)), ("平均通院回数（回）", round(1.8 + 0.2 * perf, 1)),
         ("平均滞在時間（分）", 48)], start=37
    ):
        ws.cell(row=row, column=2, value=label)
        ws.cell(row=row, column=8, value=value)

    ws = wb.create_sheet("窓口売上")
    for c, h in enumerate(["保険", "請求金額", "混合", "自費", "物販", "自費単価", "窓口金単価", "全体単価", "合計"], start=3):
        ws.cell(row=3, column=c, value=h)
    for r, patient in enumerate(["新患", "再診", "継続", "全体"], start=4):
        ins, mix, own, goods = sales[patient]
        n = people.get(patient, sum(people.values()))
        total = ins + mix + own + goods
        for c, v in zip(range(2, 12), [patient, ins, 0, mix, own, goods, int(own / max(n, 1)), int(total / max(n * 2, 1)), int(total / max(n * 2, 1)), total]):
            ws.cell(row=r, column=c, value=v)

    ws = wb.create_sheet("初診率・継続率")
    for top, patient, base in ((3, "新患", people["新患"]), (12, "再診", people["再診"]), (21, "継続", people["継続"])):
        ws.cell(row=top, column=2, value=patient)
        rates = [0.55 * perf, 0.45 * perf, 0.3, 0.2] if patient == "新患" else [0.2, 0.5, 0.3, 0.1] if patient == "再診" else [0.6, 0.48, 0.36, 0.11]
        target_n = base
        for i in range(9):
            ws.cell(row=top, column=3 + i, value=f"{i + 1}-{i + 2}")
            rate = rates[i] if i < len(rates) else 0
            back = int(target_n * rate)
            ws.cell(row=top + 1, column=3 + i, value=target_n)
            ws.cell(row=top + 2, column=3 + i, value=back)
            ws.cell(row=top + 5, column=3 + i, value=round(back / target_n, 3) if target_n else 0)
            target_n = back
        for off, label in enumerate(["対象", "戻り", "浮遊者", "完治者", "比率", "全体"], start=1):
            ws.cell(row=top + off, column=2, value=label)

    ws = wb.create_sheet("純患者数(内訳)")
    for c, h in enumerate(["前月", "比率", "当月", "比率", "増減"], start=3):
        ws.cell(row=3, column=c, value=h)
    pure = sum(people.values())
    for r, (label, cur) in enumerate(
        [("純患者数", pure), ("新患人数", people["新患"]), ("再診人数", people["再診"]), ("継続人数", people["継続"])], start=4
    ):
        prev = int(cur * 1.05)
        ws.cell(row=r, column=2, value=label)
        ws.cell(row=r, column=3, value=prev)
        ws.cell(row=r, column=5, value=cur)
        ws.cell(row=r, column=7, value=cur - prev)

    ws = wb.create_sheet("来院人数")
    for c, h in zip([2, 3, 4, 7, 8, 9], ["午前/午後", "人数", "比率", "性別", "人数", "比率"]):
        ws.cell(row=3, column=c, value=h)
    for r, (label, v, g_label, g) in enumerate(
        [("午前", visits_am, "男性", int(pure * 0.4)), ("午後", visits_pm, "女性", pure - int(pure * 0.4)), ("合計", visits_am + visits_pm, "合計", pure)], start=4
    ):
        ws.cell(row=r, column=2, value=label)
        ws.cell(row=r, column=3, value=v)
        ws.cell(row=r, column=7, value=g_label)
        ws.cell(row=r, column=8, value=g)

    ws = wb.create_sheet("施術分類")
    for c, h in enumerate(["施術分類", "人数", "比率", "売上(円)", "比率", "単価(円)"], start=2):
        ws.cell(row=2, column=c, value=h)
    menu = [
        ("保険", 320, sales["全体"][0]), ("テーピング", 80, 26_000),
        ("骨盤矯正", 70, 33_000), ("骨盤矯正体験", 5, 9_000), ("（新規）骨盤矯正回数券", 2, 110_000), ("（継続）骨盤矯正回数券", 1, 30_000),
        ("特別診療", 9, 28_000), ("特別診療声掛け", 3, 0), ("特別診療体験", 38, 133_000),
        ("（新規）特別診療回数券", 7, 470_000), ("（継続）特別診療回数券", 4, 330_000),
        ("鍼", 75, 13_000), ("鍼体験", 6, 18_000), ("（新規）鍼回数券", 7, 280_000), ("（継続）鍼回数券", 3, 85_000),
        ("パイオネックス", 110, 60_000),
        ("EMS", 40, 6_000), ("EMS検査", 4, 4_400), ("（新規）EMS回数券", 1, 99_000),
        ("美容鍼", 2, 0), ("美容鍼体験", 2, 9_900), ("（新規）美容鍼回数券", 1, 55_000),
    ]
    total_people = total_sales = 0
    for r, (name, n, s) in enumerate(menu, start=3):
        n, s = int(n * k), int(s * k) if name != "保険" else s
        total_people += n
        total_sales += s
        for c, v in zip(range(2, 8), [name, n, None, s, None, int(s / max(n, 1))]):
            ws.cell(row=r, column=c, value=v)
    ws.cell(row=3 + len(menu), column=2, value="合計")
    ws.cell(row=3 + len(menu), column=3, value=total_people)
    ws.cell(row=3 + len(menu), column=5, value=total_sales)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@st.cache_data
def sample_files(today: date, version: int = 2) -> list[tuple[str, bytes]]:
    """直近3ヶ月分＋当月途中までのサンプル報告書。"""
    out = []
    first = date(today.year, today.month, 1)
    months = [add_months(first, -3), add_months(first, -2), add_months(first, -1), first]
    for i, start in enumerate(months):
        end = month_bounds(start.year, start.month)[1] if i < 3 else max(start, today - timedelta(days=1))
        data = make_sample_report(start, end, perf=[1.02, 0.95, 1.06, 0.92][i])
        if data:
            out.append((f"月間報告書_サンプル_{start:%Y-%m}.xlsx", data))
    return out


# ---------------------------------------------------------------------------
# 共有データの保存・読み込み（Supabase またはローカルファイル）
#   ・目標・設定     … app_store テーブルの "targets" / "config" 行（JSON）
#   ・報告書の実績   … kpi_reports テーブル（Excel そのものではなく、抽出した数値と施術分類の内訳を保存）
# ---------------------------------------------------------------------------
@st.cache_resource
def shared_lock() -> threading.Lock:
    """全ユーザー（全セッション）で共通のロック。同時に保存しても内容が壊れないようにする。"""
    return threading.Lock()


def supabase_settings() -> tuple[str, str] | None:
    try:
        conf = st.secrets.get("supabase")
    except Exception:  # noqa: BLE001
        return None
    if not conf or not conf.get("url") or not conf.get("key"):
        return None
    return str(conf["url"]).strip(), str(conf["key"]).strip()


@st.cache_resource(show_spinner=False)
def supabase_client(url: str, key: str):
    from supabase import create_client

    return create_client(url, key)


def db():
    """Supabase のクライアント。接続情報が無ければ None（ローカルファイルに保存する）。"""
    conf = supabase_settings()
    return supabase_client(*conf) if conf else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- ローカルファイル（Supabase 未設定のとき） ----
def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {} if default is None else default


def write_json_atomic(path: Path, data) -> None:
    os.makedirs(path.parent, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    os.replace(tmp, path)


def local_path(key: str) -> Path:
    return DATA_DIR / f"{key}.json"


# ---- 目標・設定（キーごとの JSON） ----
def store_get(key: str) -> dict:
    client = db()
    if client is None:
        return read_json(local_path(key))
    rows = client.table(STORE_TABLE).select("value").eq("key", key).limit(1).execute().data
    return dict(rows[0]["value"] or {}) if rows else {}


def store_put(key: str, value: dict) -> None:
    client = db()
    if client is None:
        write_json_atomic(local_path(key), value)
        return
    client.table(STORE_TABLE).upsert({"key": key, "value": value, "updated_at": now_iso()}).execute()


def update_shared(key: str, changes: dict) -> None:
    """最新の内容を読み直してから、変更した部分だけを反映して保存する（他の人の保存を消さない）。"""
    with shared_lock():
        data = store_get(key)
        data.update(changes)
        store_put(key, data)


def apply_diff(key: str, section: str, before: dict, after: dict) -> None:
    """section（例：kpi）の中で、この画面で変更されたキーだけを最新の内容に反映する。"""
    changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    with shared_lock():
        data = store_get(key)
        current = dict(data.get(section, before))  # まだ一度も保存されていなければ、表示していた値（初期値）を土台にする
        for k in changed:
            if after.get(k) is None:
                current.pop(k, None)
            else:
                current[k] = after[k]
        data[section] = current
        store_put(key, data)


# ---- 報告書から抽出した実績 ----
def to_jsonable(obj):
    """データベース（JSON）に保存できる形にそろえる（NaN → None、numpy の数値 → Python の数値）。"""
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return None if pd.isna(obj) else float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def report_row(file_name: str, ext: dict, period: dict) -> dict:
    """抽出結果を、データベースに保存する1行（院・月ごと）に変換する。"""
    month = f"{period['end']:%Y-%m}"
    return to_jsonable({
        "id": f"{ext['clinic']}|{month}",
        "clinic": ext["clinic"],
        "month": month,
        "period_start": period["start"].isoformat(),
        "period_end": period["end"].isoformat(),
        "file_name": file_name,
        "data_values": ext["values"],
        "breakdown": ext["breakdown"].to_dict("records"),
        "uploaded_at": now_iso(),
    })


def load_report_rows() -> list[dict]:
    client = db()
    if client is None:
        return list(read_json(local_path("reports"), default={}).values())
    return client.table(REPORT_TABLE).select("*").order("period_end").execute().data


def save_report_row(row: dict) -> str:
    """院・月ごとに1行。同じ院・同じ月が保存済みなら、対象期間がより新しい方を残す。"new"／"update"／"skip" を返す。"""
    with shared_lock():
        client = db()
        if client is None:
            rows = read_json(local_path("reports"), default={})
            existing = rows.get(row["id"])
        else:
            found = client.table(REPORT_TABLE).select("period_start, period_end").eq("id", row["id"]).limit(1).execute().data
            existing = found[0] if found else None
        if existing and (str(existing["period_end"])[:10], str(existing["period_start"])[:10]) > (row["period_end"], row["period_start"]):
            return "skip"
        if client is None:
            rows[row["id"]] = row
            write_json_atomic(local_path("reports"), rows)
        else:
            client.table(REPORT_TABLE).upsert(row).execute()
        return "update" if existing else "new"


def delete_report_rows(ids: list[str]) -> None:
    with shared_lock():
        client = db()
        if client is None:
            rows = read_json(local_path("reports"), default={})
            for i in ids:
                rows.pop(i, None)
            write_json_atomic(local_path("reports"), rows)
        elif ids:
            client.table(REPORT_TABLE).delete().in_("id", ids).execute()


def row_to_report(row: dict) -> dict:
    breakdown = pd.DataFrame(row.get("breakdown") or [], columns=["分類", "人数", "売上"])
    return {
        "id": row["id"],
        "file": row.get("file_name") or row["id"],
        "clinic": row["clinic"],
        "period": {
            "start": date.fromisoformat(str(row["period_start"])[:10]),
            "end": date.fromisoformat(str(row["period_end"])[:10]),
        },
        "values": row.get("data_values") or {},
        "breakdown": breakdown,
    }


def shared_signature() -> tuple:
    """目標・設定・実績のどれかが更新されたかを判定するための目印（30秒ごとの自動更新で使う）。"""
    client = db()
    if client is None:
        return tuple(p.stat().st_mtime_ns if p.exists() else 0 for p in (local_path("targets"), local_path("config"), local_path("reports")))
    latest_store = client.table(STORE_TABLE).select("updated_at").order("updated_at", desc=True).limit(1).execute().data
    reports = client.table(REPORT_TABLE).select("uploaded_at", count="exact").order("uploaded_at", desc=True).limit(1).execute()
    return (
        latest_store[0]["updated_at"] if latest_store else None,
        reports.data[0]["uploaded_at"] if reports.data else None,
        reports.count,
    )


def legacy_local_data() -> dict:
    """このPCのファイルに保存されていた目標・設定・報告書（以前の版のデータ）。クラウドへの移行に使う。"""
    old = read_json(LEGACY_DIR / "settings.json")
    targets = read_json(local_path("targets")) or (
        {"kpi": old["kpi_targets"], "menu_sales": old.get("menu_targets", {}), "menu_count": old.get("menu_count_targets", {})}
        if old.get("kpi_targets") else {}
    )
    config = read_json(local_path("config")) or {k: old[k] for k in ("custom_items", "menu_groups", "manual_periods") if k in old}
    files = []
    for folder in (LOCAL_UPLOAD_DIR, LEGACY_DIR / "uploads"):
        if folder.exists():
            files += [f for f in folder.iterdir() if f.is_file() and f.suffix.lower()[1:] in SUPPORTED_EXTS]
    return {"targets": targets, "config": config, "files": files, "reports": read_json(local_path("reports"), default={})}


# ---------------------------------------------------------------------------
# 計算
# ---------------------------------------------------------------------------
def add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    return date(d.year + m // 12, m % 12 + 1, 1)


def judge(actual: float, target, found: bool, agg: str, ratio: float) -> dict:
    """差額＝実績−目標、進捗率＝実績÷目標×100。積み上げ項目は日割りの基準と比べて順調／遅れを判定。"""
    has_target = target is not None and not pd.isna(target) and float(target) > 0
    out = {"diff": np.nan, "progress": np.nan, "expected": np.nan, "forecast": np.nan}
    if has_target:
        target = float(target)
        out["diff"] = actual - target
        out["progress"] = actual / target * 100
        out["expected"] = target * ratio if agg == SUM else target
    if agg == SUM and ratio > 0:
        out["forecast"] = actual / ratio
    if not found:
        status = ST_MISSING
    elif not has_target:
        status = ST_NOTARGET
    elif actual >= target:
        status = ST_DONE
    elif agg == SUM and actual >= out["expected"]:
        status = ST_ONTRACK
    else:
        status = ST_BEHIND
    out["status"] = status
    return out


def fmt(v, unit: str = "") -> str:
    if v is None or pd.isna(v):
        return "—"
    if unit == "%":
        return f"{v:,.1f}%"
    if unit in ("回", "分") or (abs(v) < 100 and not float(v).is_integer()):
        return f"{v:,.1f}{unit}"
    return f"{v:,.0f}{unit}"


def fmt_signed(v, unit: str = "") -> str:
    if v is None or pd.isna(v):
        return "—"
    return ("+" if v >= 0 else "−") + fmt(abs(v), "ポイント" if unit == "%" else unit)


# ---------------------------------------------------------------------------
# 表示部品
# ---------------------------------------------------------------------------
CSS = """
<style>
.block-container {padding-top:3.2rem; max-width:1240px;}
.page-title {font-size:1.35rem; font-weight:700; margin:0;}
.page-meta {font-size:.82rem; opacity:.62; margin:4px 0 18px;}
.sec {font-size:1rem; font-weight:700; margin:34px 0 12px; padding-bottom:6px;
  border-bottom:1px solid rgba(128,128,128,.2);}
.sec small {font-weight:400; opacity:.6; margin-left:8px; font-size:.78rem;}
.chips {display:flex; gap:8px; flex-wrap:wrap; margin:0 0 16px;}
.chip {padding:5px 12px; border-radius:999px; font-size:.8rem; background:rgba(128,128,128,.08);}
.chip b {font-size:.95rem; margin-left:4px;}
.kpi-grid {display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:12px; margin-bottom:12px;}
.kpi-card {border:1px solid rgba(128,128,128,.18); border-radius:10px; padding:12px 14px 10px;}
.kpi-head {display:flex; align-items:center; gap:6px; font-size:.78rem; opacity:.7; font-weight:600;}
.dot {width:8px; height:8px; border-radius:50%; display:inline-block; flex:none;}
.kpi-value {font-size:1.4rem; font-weight:700; line-height:1.3; margin-top:4px;}
.kpi-card.small .kpi-value {font-size:1.05rem;}
.kpi-gap {font-size:.8rem; font-weight:600; margin-top:2px;}
.kpi-bar {position:relative; height:5px; border-radius:3px; background:rgba(128,128,128,.18); margin:8px 0 6px;}
.kpi-bar > .fill {height:100%; border-radius:3px;}
.kpi-bar > .pace {position:absolute; top:-3px; width:2px; height:11px; background:rgba(90,90,90,.8);}
.kpi-meta {display:flex; justify-content:space-between; font-size:.72rem; opacity:.6;}
.panel {border:1px solid rgba(128,128,128,.18); border-radius:10px; padding:12px 14px;}
.panel h4 {font-size:.82rem; margin:0 0 8px; font-weight:700;}
.panel .row {display:flex; justify-content:space-between; gap:8px; font-size:.82rem; padding:5px 0;
  border-top:1px solid rgba(128,128,128,.12);}
.panel .row:first-of-type {border-top:none;}
.panel .muted {opacity:.6; font-size:.8rem;}
.mt-wrap {overflow-x:auto;}
.mt {min-width:1020px; border:1px solid rgba(128,128,128,.18); border-radius:10px; overflow:hidden;}
.mt-row {display:grid; grid-template-columns:minmax(210px,1fr) 62px 72px 118px 108px 104px 128px 64px; gap:10px;
  align-items:center; padding:9px 14px; font-size:.82rem;}
.mt-row > span:nth-child(5) {border-left:1px solid rgba(128,128,128,.18); padding-left:10px;}
.mt-row .gap {display:block; font-size:.68rem; font-weight:600; margin-top:1px;}
.mt-row > span:not(:first-child) {text-align:right;}
.mt-hd {font-size:.72rem; opacity:.6; font-weight:600; background:rgba(128,128,128,.06);}
.mt-group {border-top:1px solid rgba(128,128,128,.14);}
.mt-parent {font-weight:700;}
.mt-parent .amt {font-size:.95rem;}
.mt-child {font-size:.78rem; padding-top:5px; padding-bottom:5px; opacity:.85; background:rgba(128,128,128,.03);}
.mt-child > span:first-child {padding-left:26px;}
.mt-child > span:first-child::before {content:"└ "; opacity:.45;}
details.mt-group > summary {list-style:none; cursor:pointer;}
details.mt-group > summary::-webkit-details-marker {display:none;}
.caret {display:inline-block; width:14px; opacity:.55; transition:transform .15s;}
details[open] .caret {transform:rotate(90deg);}
.cnt {font-weight:400; opacity:.5; font-size:.75rem; margin-left:4px;}
.tsrc {display:block; font-weight:400; opacity:.55; font-size:.68rem;}
.mini {display:inline-flex; align-items:center; gap:6px; justify-content:flex-end; width:100%;}
.mini .track {flex:1; max-width:80px; height:4px; border-radius:2px; background:rgba(128,128,128,.2); overflow:hidden;}
.mini .track > div {height:100%;}
.up {color:#2e7d32;} .down {color:#c62828;}
</style>
"""


def section(title: str, note: str = "") -> None:
    st.markdown(f"<div class='sec'>{title}{f'<small>{note}</small>' if note else ''}</div>", unsafe_allow_html=True)


def gap_text(row: pd.Series) -> str:
    unit = "ポイント" if row["単位"] == "%" else row["単位"]
    gap = row["目標"] - row["現状"]
    return f"あと {fmt(gap, unit)}" if gap > 0 else f"達成 {fmt_signed(-gap, row['単位'])}"


def kpi_card(row: pd.Series, ratio: float, small: bool = False) -> str:
    color = STATUS_STYLE[row["判定"]][0]
    unit = row["単位"]
    has_target = not pd.isna(row["目標"])
    width = 0 if pd.isna(row["進捗率"]) else max(0.0, min(row["進捗率"], 100.0))
    pace = ""
    if has_target and row["集計"] == SUM and 0 < ratio < 1:
        pace = f"<div class='pace' style='left:{ratio * 100:.1f}%'></div>"
    gap = f"<div class='kpi-gap' style='color:{color}'>{gap_text(row)}</div>" if has_target else "<div class='kpi-gap' style='opacity:.5'>目標未設定</div>"
    meta = f"<span>目標 {fmt(row['目標'], unit)}</span><span>{fmt(row['進捗率'], '%')}</span>" if has_target else "<span></span>"
    return (
        f"<div class='kpi-card{' small' if small else ''}'>"
        f"<div class='kpi-head'><span class='dot' style='background:{color}'></span>{row['項目']}</div>"
        f"<div class='kpi-value'>{fmt(row['現状'], unit)}</div>{gap}"
        f"<div class='kpi-bar'><div class='fill' style='width:{width:.1f}%;background:{color}'></div>{pace}</div>"
        f"<div class='kpi-meta'>{meta}</div></div>"
    )


def list_panel(title: str, rows: pd.DataFrame, color: str, empty: str) -> str:
    if rows.empty:
        body = f"<div class='muted'>{empty}</div>"
    else:
        body = "".join(
            f"<div class='row'><span><span class='dot' style='background:{color}'></span>&nbsp;{r['項目']}</span>"
            f"<span>{gap_text(r)}<span class='muted'>　{fmt(r['進捗率'], '%')}</span></span></div>"
            for _, r in rows.iterrows()
        )
    return f"<div class='panel'><h4>{title}</h4>{body}</div>"


def menu_tree_html(tree: list[dict], ratio: float, total: float, open_top: int = 3) -> str:
    """親メニュー（合計）の行の下に内訳の行がぶら下がる表。件数と売上の両方の進捗を表示する。"""
    DASH = "<span style='opacity:.35'>—</span>"

    def status_of(actual, target):
        return judge(actual, target, True, SUM, ratio)["status"] if target else ST_NOTARGET

    def progress(actual, target, unit):
        """進捗バーと進捗率、その下に「あと◯」（達成なら超過分）。"""
        if not target:
            return DASH
        res = judge(actual, target, True, SUM, ratio)
        color = STATUS_STYLE[res["status"]][0]
        gap = target - actual
        gap_txt = f"あと {fmt(gap, unit)}" if gap > 0 else f"達成 +{fmt(-gap, unit)}"
        return (
            f"<span class='mini'><span class='track'><div style='width:{min(res['progress'], 100):.0f}%;background:{color}'></div>"
            f"</span>{res['progress']:.0f}%</span><span class='gap' style='color:{color}'>{gap_txt}</span>"
        )

    def mom(actual, prev):
        if pd.isna(prev) or not prev:
            return DASH
        r = actual / prev * 100
        return f"<span class='{'up' if r >= 100 else 'down'}'>{r:.0f}%</span>"

    def dot(row):
        status = status_of(row["売上"], row["目標"]) if row["目標"] else status_of(row["人数"], row["件数目標"])
        return f"<span class='dot' style='background:{STATUS_STYLE[status][0]}'></span>"

    def cells(row, name_html):
        share = row["売上"] / total * 100 if total else 0
        return (
            f"<span>{name_html}</span>"
            f"<span>{fmt(row['人数'], '件')}</span>"
            f"<span>{fmt(row['件数目標'], '件') if row['件数目標'] else DASH}</span>"
            f"<span>{progress(row['人数'], row['件数目標'], '件')}</span>"
            f"<span class='amt' title='構成比 {share:.1f}%'>{fmt(row['売上'], '円')}</span>"
            f"<span>{fmt(row['目標'], '円') if row['目標'] else DASH}</span>"
            f"<span>{progress(row['売上'], row['目標'], '円')}</span>"
            f"<span>{mom(row['売上'], row['前月'])}</span>"
        )

    head = (
        "<div class='mt-row mt-hd'><span>メニュー（親）／内訳</span>"
        "<span>件数</span><span>件数目標</span><span>件数の進捗</span>"
        "<span>売上</span><span>売上目標</span><span>売上の進捗</span><span>売上前月比</span></div>"
    )
    body = []
    for i, g in enumerate(tree):
        caret = "<span class='caret'>▸</span>" if g["multi"] else "<span class='caret'></span>"
        count = f"<span class='cnt'>{len(g['members'])}項目</span>" if g["multi"] else ""
        name = f"{caret}{dot(g)}&nbsp;{html.escape(g['group'])}{' 全体' if g['multi'] else ''}{count}"
        parent = cells(g, name)
        if not g["multi"]:
            body.append(f"<div class='mt-group'><div class='mt-row mt-parent'>{parent}</div></div>")
            continue
        kids = "".join(f"<div class='mt-row mt-child'>{cells(m, html.escape(m['name']))}</div>" for m in g["members"])
        body.append(f"<details class='mt-group'{' open' if i < open_top else ''}><summary class='mt-row mt-parent'>{parent}</summary>{kids}</details>")
    return f"<div class='mt-wrap'><div class='mt'>{head}{''.join(body)}</div></div>"


# ===========================================================================
# 共通処理（どのページでも実行）：ファイルの読み込み・抽出・集計
# ===========================================================================
st.markdown(CSS, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# パスワード認証（パスワードは .streamlit/secrets.toml の admin_password から読み込む）
# ---------------------------------------------------------------------------
def configured_password() -> str | None:
    try:
        value = st.secrets.get("admin_password")
    except Exception:  # noqa: BLE001  secrets.toml が無い・書式が不正など
        return None
    return str(value) if value else None


def require_login() -> None:
    """未ログインならログイン画面だけを表示して、以降の処理（ファイル読み込み・ダッシュボード）を止める。"""
    if st.session_state.get("authenticated"):
        return
    st.markdown("<div style='height:8vh'></div>", unsafe_allow_html=True)
    _, center, _ = st.columns([1, 1.2, 1])
    with center:
        st.markdown("<div class='page-title'>🔒 月間KPIダッシュボード</div>", unsafe_allow_html=True)
        st.markdown("<div class='page-meta'>パスワードを入力してログインしてください。</div>", unsafe_allow_html=True)
        password = configured_password()
        if password is None:
            st.error(
                "パスワードが設定されていません。アプリのフォルダに `.streamlit/secrets.toml` を作成し、"
                '`admin_password = "（パスワード）"` を書き込んでから、ページを再読み込みしてください。'
            )
            st.stop()
        with st.form("login_form", border=True):
            entered = st.text_input("パスワード", type="password", placeholder="パスワード")
            submitted = st.form_submit_button("ログイン", type="primary", width="stretch")
        if submitted:
            if hmac.compare_digest(entered.encode("utf-8"), password.encode("utf-8")):
                st.session_state.authenticated = True
                st.rerun()
            st.error("パスワードが違います。")
    st.stop()


require_login()
with st.sidebar:
    if st.button("ログアウト", icon="🔓", key="logout"):
        st.session_state.clear()
        st.rerun()

today = date.today()
ss = st.session_state
ss.setdefault("target_ver", 0)
ss.setdefault("upload_ver", 0)
BACKEND = "Supabase（クラウドのデータベース）" if supabase_settings() else "このPCのファイル（data フォルダ）"


@st.cache_data(show_spinner=False)
def cached_report_rows(signature: tuple) -> list[dict]:
    """保存済みの実績。データが更新されない限り（signature が同じ限り）データベースを読み直さない。"""
    return load_report_rows()


# 共有の目標・設定・実績は、画面を表示するたびに最新の内容を確認する（他の人が保存した値もすぐ反映される）
try:
    ss.data_sig = shared_signature()
    shared_targets = store_get("targets")
    config = store_get("config")
    report_rows = cached_report_rows(ss.data_sig)
except Exception as e:  # noqa: BLE001
    st.error(
        f"**データベースに接続できませんでした。**（{type(e).__name__}: {str(e)[:200]}）\n\n"
        "- `.streamlit/secrets.toml`（クラウドでは Secrets 設定）の `[supabase]` の `url` と `key` が正しいか確認してください。\n"
        "- Supabase の SQL Editor で `supabase_setup.sql` を実行して、テーブルを作成済みか確認してください。"
    )
    st.stop()
ss.kpi_targets = dict(shared_targets.get("kpi", DEFAULT_TARGETS))     # 一度も保存されていなければ初期値
ss.menu_targets = dict(shared_targets.get("menu_sales", {}))           # メニュー別 売上目標
ss.menu_count_targets = dict(shared_targets.get("menu_count", {}))     # メニュー別 件数目標

# 追加の抽出項目（目標設定ページで編集。アップロード時の抽出に使う）
custom = tuple(
    (
        str(r.get("項目名") or "").strip(), str(r.get("単位") or ""), r.get("集計") if r.get("集計") in (SUM, MEAN) else SUM,
        str(r.get("シート名") or "").strip(), str(r.get("基準ラベル") or "").strip(), str(r.get("行ラベル") or "").strip(),
        str(r.get("列ラベル") or "").strip(), bool(r.get("割合を%に")),
    )
    for r in config.get("custom_items", [])
    if str(r.get("項目名") or "").strip() and str(r.get("行ラベル") or "").strip()
)

# ローカル保存のときだけ：以前の版で uploads フォルダに保存された報告書を、初回に一度だけ数値データへ変換する
if not supabase_settings() and not local_path("reports").exists():
    manual = config.get("manual_periods", {})
    for f in legacy_local_data()["files"]:
        try:
            ext = extract_file(f.read_bytes(), f.name, custom, CATALOG_SIG)
        except (OSError, ValueError):
            continue
        period = ext["period"] or (
            {"start": date.fromisoformat(manual[f.name][0]), "end": date.fromisoformat(manual[f.name][1])} if f.name in manual else None
        )
        if period:
            save_report_row(report_row(f.name, ext, period))
    if not local_path("reports").exists():
        write_json_atomic(local_path("reports"), {})
    ss.data_sig = shared_signature()
    report_rows = cached_report_rows(ss.data_sig)

with st.sidebar:
    st.markdown("**📂 月間報告書（全員で共有）**")
    uploads = st.file_uploader(
        "Excel（.xls / .xlsx）を選択（複数可）",
        type=SUPPORTED_EXTS,
        accept_multiple_files=True,
        help="報告書から数値を取り出してデータベースに保存します（Excel ファイルそのものは保存しません）。他の人の画面にも表示されます。",
        label_visibility="collapsed",
        key=f"uploader_{ss.upload_ver}",
    )
    if uploads:
        counts = {"new": 0, "update": 0, "skip": 0}
        errors, pending = [], []
        with st.spinner("報告書から数値を取り出して保存しています…"):
            for u in uploads:
                try:
                    ext = extract_file(u.getvalue(), u.name, custom, CATALOG_SIG)
                except ValueError as e:
                    errors.append(f"「{u.name}」：{e}")
                    continue
                if ext["period"] is None:
                    pending.append({"file": u.name, "ext": ext})  # 対象期間を指定してから保存する
                    continue
                counts[save_report_row(report_row(u.name, ext, ext["period"]))] += 1
        ss.pending_reports = ss.get("pending_reports", []) + pending
        ss.upload_notice = (
            f"保存しました：新規 {counts['new']}件・更新 {counts['update']}件"
            + (f"・より新しい報告書が保存済みのため見送り {counts['skip']}件" if counts["skip"] else "")
        )
        ss.upload_errors = errors
        ss.upload_ver += 1  # アップロード欄を空に戻す
        st.rerun()
    if notice := ss.pop("upload_notice", None):
        st.success(notice, icon="✅")
    for msg in ss.pop("upload_errors", []):
        st.error(msg)

    if ss.get("pending_reports"):
        with st.expander("📅 対象期間を指定して保存", expanded=True):
            st.caption("次の報告書は対象期間が見つかりませんでした。期間を指定して保存してください。")
            with st.form("pending_form", border=False):
                picked = [
                    st.date_input(pnd["file"], value=(date(today.year, today.month, 1), today), key=f"pending_{i}_{ss.upload_ver}")
                    for i, pnd in enumerate(ss.pending_reports)
                ]
                c1, c2 = st.columns(2)
                ok = c1.form_submit_button("保存", type="primary", width="stretch")
                cancel = c2.form_submit_button("取り消す", width="stretch")
            if ok or cancel:
                if ok:
                    for pnd, val in zip(ss.pending_reports, picked):
                        if isinstance(val, (tuple, list)) and len(val) == 2:
                            save_report_row(report_row(pnd["file"], pnd["ext"], {"start": val[0], "end": val[1]}))
                ss.pending_reports = []
                st.rerun()

reports = [row_to_report(r) for r in report_rows]
read_errors: list[str] = []
using_sample = not reports
with st.sidebar:
    if reports:
        with st.expander(f"保存済みの実績（{len(reports)}件）"):
            st.caption("院・月ごとに1件です。ここで削除すると、全員の画面から消えます。")
            labels = {f"{r['clinic']}／{r['period']['end']:%Y年%m月}（{r['period']['start']:%m/%d}〜{r['period']['end']:%m/%d}）": r["id"] for r in reports}
            to_delete = st.multiselect("削除する実績", list(labels), key=f"del_{ss.upload_ver}", label_visibility="collapsed",
                                       placeholder="削除する実績を選択")
            if st.button("選択した実績を削除", disabled=not to_delete):
                delete_report_rows([labels[x] for x in to_delete])
                ss.upload_ver += 1
                st.rerun()
    st.caption(f"保存先：{BACKEND}（30秒ごとに他の人の更新を確認）")

if using_sample:
    for name, raw in sample_files(today, 2):
        ext = extract_file(raw, name, custom, CATALOG_SIG)
        reports.append({"id": name, "file": name, "clinic": ext["clinic"], "period": ext["period"],
                        "values": ext["values"], "breakdown": ext["breakdown"]})

# 同じ院・同じ月の報告書が複数ある場合は、対象期間の最終日が一番新しいもの（月途中の累計なら最新）を使う
latest: dict[tuple, dict] = {}
for rep in reports:
    p = rep["period"]
    rep["month"] = pd.Period(p["end"], "M")
    key = (rep["clinic"], rep["month"])
    span = (p["end"], p["end"] - p["start"])
    if key not in latest or span > (latest[key]["period"]["end"], latest[key]["period"]["end"] - latest[key]["period"]["start"]):
        latest[key] = rep
used = list(latest.values())
skipped = [r["file"] for r in reports if r not in used]

for msg in read_errors:
    st.error(msg)
if not used:
    st.error("読み込める月間報告書がありません。サイドバーから月間報告書のExcelをアップロードしてください。")
    st.stop()

clinics = sorted({r["clinic"] for r in used})
months = sorted({r["month"] for r in used})
month_labels = [f"{m.year}年{m.month:02d}月" for m in months]
with st.sidebar:
    st.markdown("**🔎 表示する対象**")
    # 表示する月・院は人ごとの選択（各自のブラウザだけに記憶し、共有しない）
    if ss.get("sel_month_label") not in month_labels:
        ss.sel_month_label = month_labels[-1]
    month_label = st.selectbox("対象月", month_labels, key="sel_month_label")
    sel_month = months[month_labels.index(month_label)]
    clinic_options = ([ALL_CLINICS] if len(clinics) > 1 else []) + clinics
    if ss.get("sel_clinic") not in clinic_options:
        ss.sel_clinic = clinic_options[0]
    sel_clinic = st.selectbox("対象院", clinic_options, key="sel_clinic")

catalog = build_catalog(custom)
spec_by_name = {s["name"]: s for s in catalog}


def reports_for(month: pd.Period) -> list[dict]:
    return [r for r in used if r["month"] == month and (sel_clinic == ALL_CLINICS or r["clinic"] == sel_clinic)]


def aggregate_values(reps: list[dict]) -> dict[str, tuple[float, bool, str]]:
    """院をまたいだ集計（合計の項目は足し算、率・平均の項目は取得できた院の平均）。"""
    out = {}
    for spec in catalog:
        vals = [r["values"].get(spec["name"], {"value": 0.0, "found": False, "where": ""}) for r in reps]
        found = [v for v in vals if v["found"]]
        if spec["agg"] == SUM:
            value = float(sum(v["value"] for v in vals))
        else:
            value = float(np.mean([v["value"] for v in found])) if found else 0.0
        where = found[0]["where"] if len(reps) == 1 and found else ("" if not found else f"{len(found)}/{len(reps)}院で取得")
        out[spec["name"]] = (value, bool(found), where)
    return out


def breakdown_for(reps: list[dict]) -> pd.DataFrame:
    frames = [r["breakdown"] for r in reps if not r["breakdown"].empty]
    if not frames:
        return pd.DataFrame(columns=["分類", "人数", "売上"])
    return pd.concat(frames).groupby("分類", as_index=False)[["人数", "売上"]].sum()


month_reps = reports_for(sel_month)
prev_reps = reports_for(sel_month - 1)
period_start = min(r["period"]["start"] for r in month_reps)
period_end = max(r["period"]["end"] for r in month_reps)
dim = calendar.monthrange(sel_month.year, sel_month.month)[1]
month_start = date(sel_month.year, sel_month.month, 1)
covered_days = (period_end - month_start).days + 1 if period_start <= month_start else (period_end - period_start).days + 1
ratio = min(max(covered_days / dim, 0.0), 1.0)
values = aggregate_values(month_reps)
prev_values = aggregate_values(prev_reps) if prev_reps else {}
menu_now = breakdown_for(month_reps)
menu_prev = breakdown_for(prev_reps)

# ---------------------------------------------------------------------------
# 施術分類の階層化（親メニュー → 内訳）
#   「(新規)EMS回数券」「EMS体験」「EMS検査」… → 親メニュー「EMS」
# ---------------------------------------------------------------------------
GROUP_KEY = "group::"  # 親メニューの目標を保存するときのキーの接頭辞
MENU_PREFIX_RE = re.compile(r"^\s*\(\s*(新規|継続|初回|再来|既存)\s*\)\s*")
MENU_SUFFIXES = ["回数券消化カウント用", "消化カウント用", "カウント用", "回数券", "体験", "声掛け", "検査", "チケット"]
# 名前に含まれる文字で親メニューを固定するルール（自動判定より優先。「グループ分けを調整」の手動設定はさらに優先）
FIXED_MENU_GROUPS = [("パイオネックス", "鍼"), ("灸", "鍼")]


def base_menu(name: str) -> str:
    """接頭辞（(新規)など）・接尾辞（回数券・体験・声掛け・検査など）を外したメニューの基本名。"""
    s = unicodedata.normalize("NFKC", str(name)).strip()
    s = MENU_PREFIX_RE.sub("", s)
    s = re.split(r"/", s)[0]
    s = re.sub(r"\s+", "", s)
    for suffix in MENU_SUFFIXES:
        if s.endswith(suffix) and len(s) > len(suffix):
            s = s[: -len(suffix)]
            break
    return s or str(name)


def auto_menu_groups(names) -> dict[str, str]:
    """分類名 → 親メニュー名。基本名が別の親メニュー名で始まる場合（鍼パルス → 鍼）はそちらにまとめる。"""
    bases = {n: base_menu(n) for n in names}
    roots = set(bases.values())
    out = {}
    for n, b in bases.items():
        fixed = next((parent for word, parent in FIXED_MENU_GROUPS if word in unicodedata.normalize("NFKC", n)), None)
        if fixed:
            out[n] = fixed
            continue
        parents = [r for r in roots if r != b and b.startswith(r)]
        out[n] = max(parents, key=len) if parents else b
    return out


ss.menu_groups = dict(config.get("menu_groups", {}))  # 手動で変更したグループ分けだけを共有ファイルに保存
all_menu_names = sorted(set(menu_now["分類"]) | set(menu_prev["分類"]))
auto_groups = auto_menu_groups(all_menu_names)
menu_groups = {n: ss.menu_groups.get(n) or auto_groups[n] for n in all_menu_names}


def resolve_group_target(targets: dict, group: str, members: list[dict], field: str, multi: bool):
    """親の目標は「親に直接入れた値」→「内訳の目標の合計」の順に使う。"""
    if not multi:
        return members[0][field]
    explicit = targets.get(GROUP_KEY + group)
    if explicit:
        return explicit
    kids = [m[field] for m in members if m[field]]
    return float(sum(kids)) if kids else None


def menu_tree() -> list[dict]:
    """親メニューごとの合計（売上・件数）・目標・内訳。"""
    now = menu_now.set_index("分類") if not menu_now.empty else pd.DataFrame(columns=["人数", "売上"])
    prev = menu_prev.set_index("分類") if not menu_prev.empty else pd.DataFrame(columns=["人数", "売上"])
    groups: dict[str, list[dict]] = {}
    for name in all_menu_names:
        groups.setdefault(menu_groups[name], []).append(
            {
                "name": name,
                "人数": float(now["人数"].get(name, 0.0)),
                "売上": float(now["売上"].get(name, 0.0)),
                "前月": float(prev["売上"][name]) if name in prev.index else np.nan,
                "前月件数": float(prev["人数"][name]) if name in prev.index else np.nan,
                "目標": ss.menu_targets.get(name),          # 売上目標
                "件数目標": ss.menu_count_targets.get(name),
            }
        )
    tree = []
    for group, members in groups.items():
        members.sort(key=lambda m: (-m["売上"], -m["人数"]))
        multi = len(members) > 1
        prevs = [m["前月"] for m in members if not pd.isna(m["前月"])]
        prev_counts = [m["前月件数"] for m in members if not pd.isna(m["前月件数"])]
        tree.append(
            {
                "group": group,
                "multi": multi,
                "members": members,
                "人数": sum(m["人数"] for m in members),
                "売上": sum(m["売上"] for m in members),
                "前月": sum(prevs) if prevs else np.nan,
                "前月件数": sum(prev_counts) if prev_counts else np.nan,
                "目標": resolve_group_target(ss.menu_targets, group, members, "目標", multi),
                "件数目標": resolve_group_target(ss.menu_count_targets, group, members, "件数目標", multi),
            }
        )
    tree.sort(key=lambda g: (-g["売上"], -g["人数"], g["group"]))
    return tree


def build_kpi_table() -> pd.DataFrame:
    """目標設定ページの値を参照して、全項目の実績・目標・差額・進捗率・判定を計算する。"""
    rows = []
    for spec in catalog:
        value, found, where = values[spec["name"]]
        target = ss.kpi_targets.get(spec["name"])
        res = judge(value, target, found, spec["agg"], ratio)
        rows.append(
            {
                "カテゴリ": spec["category"],
                "項目": spec["name"],
                "単位": spec["unit"],
                "集計": spec["agg"],
                "現状": value,
                "取得": found,
                "目標": float(target) if target is not None and not pd.isna(target) else np.nan,
                "差額": res["diff"],
                "進捗率": res["progress"],
                "着地見込み": res["forecast"],
                "判定": res["status"],
                "取得元": where,
            }
        )
    table = pd.DataFrame(rows)
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    table["_o"] = table["カテゴリ"].map(order).fillna(99)
    return table.sort_values("_o", kind="stable").drop(columns="_o").reset_index(drop=True)


period_text = f"{period_start:%Y/%m/%d}〜{period_end:%m/%d}（{covered_days}/{dim}日・{ratio:.0%}経過）"


# ===========================================================================
# ページ：ダッシュボード
# ===========================================================================
@st.fragment(run_every=30)
def watch_shared_updates():
    """30秒ごとに共有ファイルを確認し、他の人がアップロード・保存していたら画面を最新の内容で描き直す。"""
    if shared_signature() != ss.data_sig:
        st.rerun(scope="app")


def page_dashboard():
    watch_shared_updates()
    kpi = build_kpi_table()
    by_name = kpi.set_index("項目")
    st.markdown("<div class='page-title'>📊 月間KPIダッシュボード</div>", unsafe_allow_html=True)
    st.markdown(
        f"<div class='page-meta'>{sel_clinic}　·　{period_text}"
        + ("　·　サンプルデータ" if using_sample else "")
        + "</div>",
        unsafe_allow_html=True,
    )
    if using_sample:
        st.info("サンプルを表示中です。サイドバーから月間報告書（.xls / .xlsx）をアップロードしてください。", icon="🧪")

    # ---- 全体の状況（ひと目で分かる要約） ----
    judged = kpi[kpi["判定"].isin([ST_DONE, ST_ONTRACK, ST_BEHIND])]
    counts = {s: int((judged["判定"] == s).sum()) for s in (ST_DONE, ST_ONTRACK, ST_BEHIND)}
    chips = "".join(
        f"<span class='chip'><span class='dot' style='background:{STATUS_STYLE[s][0]}'></span> {s}<b>{counts[s]}</b></span>"
        for s in (ST_DONE, ST_ONTRACK, ST_BEHIND)
    )
    n_missing = int((kpi["判定"] == ST_MISSING).sum())
    if n_missing:
        chips += f"<span class='chip' style='opacity:.7'>⚠️ 未検出<b>{n_missing}</b></span>"
    st.markdown(f"<div class='chips'>{chips}</div>", unsafe_allow_html=True)

    for names, small in ((HEADLINE_ITEMS, False), (SECONDARY_ITEMS, True)):
        cards = [kpi_card(kpi[kpi["項目"] == n].iloc[0], ratio, small) for n in names if n in by_name.index]
        st.markdown("<div class='kpi-grid'>" + "".join(cards) + "</div>", unsafe_allow_html=True)

    behind = judged[judged["判定"] == ST_BEHIND].sort_values("進捗率").head(5)
    good = judged[judged["判定"] == ST_DONE].sort_values("進捗率", ascending=False).head(5)
    c1, c2 = st.columns(2, gap="medium")
    c1.markdown(list_panel("遅れている項目", behind, STATUS_STYLE[ST_BEHIND][0], "遅れている項目はありません"), unsafe_allow_html=True)
    c2.markdown(list_panel("達成した項目", good, STATUS_STYLE[ST_DONE][0], "達成した項目はまだありません"), unsafe_allow_html=True)
    if 0 < ratio < 1:
        st.caption("バーの縦線は、月の経過日数から見て本日時点で到達しているべき位置です。")

    # ---- 項目別の一覧 ----
    section("項目別の目標・実績", "目標は「目標設定」ページで変更できます")
    f1, f2 = st.columns([3, 1])
    with f1:
        scope = st.segmented_control(
            "表示", ["目標を設定した項目", "すべての項目"], default="目標を設定した項目", key="item_scope", label_visibility="collapsed"
        ) or "目標を設定した項目"
    with f2:
        st.page_link(target_page, label="目標を変更する", icon="🎯")
    table = kpi if scope == "すべての項目" else kpi[kpi["目標"].notna()]
    view = pd.DataFrame(
        {
            "判定": table["判定"].map(lambda s: STATUS_STYLE[s][1]),
            "項目": table.apply(lambda r: r["項目"] if r["取得"] else f"⚠️ {r['項目']}", axis=1),
            "実績": table.apply(lambda r: fmt(r["現状"], r["単位"]), axis=1),
            "目標": table.apply(lambda r: fmt(r["目標"], r["単位"]), axis=1),
            "差額": table.apply(lambda r: fmt_signed(r["差額"], r["単位"]), axis=1),
            "進捗率": table["進捗率"],
            "月末着地見込み": table.apply(lambda r: fmt(r["着地見込み"], r["単位"]) if r["集計"] == SUM else "—", axis=1),
        }
    )
    st.dataframe(
        view,
        hide_index=True,
        width="stretch",
        height=min(36 * (len(view) + 1) + 4, 560),
        column_config={
            "判定": st.column_config.TextColumn(width="small"),
            "項目": st.column_config.TextColumn(width="medium"),
            "進捗率": st.column_config.ProgressColumn(format="%.1f%%", min_value=0, max_value=100, color="#4e79a7"),
            "差額": st.column_config.TextColumn(help="実績 − 目標（マイナス＝不足分）"),
        },
    )
    if (~kpi["取得"]).any():
        st.caption("⚠️ の項目は報告書の中に見つからなかったため、0 として計算しています。")

    # ---- メニュー・カテゴリ別 ----
    section("メニュー・カテゴリ別")
    st.markdown("**窓口売上の内訳**")
    matrix = [
        {"患者区分": p, "区分": k, "売上": by_name.at[f"{k}売上（{p}）", "現状"]}
        for p in ["新患", "再診", "継続"]
        for k in SALES_COLORS
        if f"{k}売上（{p}）" in by_name.index
    ]
    matrix_df = pd.DataFrame(matrix)
    if matrix_df.empty or matrix_df["売上"].sum() == 0:
        st.caption("患者区分別の売上が報告書から取得できませんでした。")
    else:
        left, right = st.columns([5, 6], gap="large")
        left.altair_chart(
            alt.Chart(matrix_df)
            .mark_bar()
            .encode(
                y=alt.Y("患者区分:N", sort=["新患", "再診", "継続"], title=None),
                x=alt.X("売上:Q", title=None, stack="zero", axis=alt.Axis(format="~s")),
                color=alt.Color("区分:N", scale=alt.Scale(domain=list(SALES_COLORS), range=list(SALES_COLORS.values())),
                                legend=alt.Legend(orient="top", title=None)),
                tooltip=["患者区分", "区分", alt.Tooltip("売上:Q", format=",.0f")],
            )
            .properties(height=alt.Step(30)),
            width="stretch",
        )
        pivot = matrix_df.pivot_table(index="患者区分", columns="区分", values="売上", aggfunc="sum").reindex(
            index=["新患", "再診", "継続"], columns=list(SALES_COLORS)
        )
        pivot["合計"] = pivot.sum(axis=1)
        pivot.loc["全体"] = pivot.sum()
        right.dataframe(pivot.style.format("{:,.0f}"), width="stretch")

    st.markdown("**施術分類（メニュー）別の売上**")
    if menu_now.empty:
        st.caption("「施術分類」の一覧が報告書から取得できませんでした。")
    else:
        tree = menu_tree()
        total = sum(g["売上"] for g in tree) or 1.0
        def is_active(g):
            return g["売上"] > 0 or g["人数"] > 0 or bool(g["目標"]) or bool(g["件数目標"])

        active = [g for g in tree if is_active(g)]
        idle = [g for g in tree if not is_active(g)]
        st.markdown(menu_tree_html(active, ratio, total), unsafe_allow_html=True)
        st.caption(
            "親メニューの行は内訳（新規・継続の回数券、体験、声掛けなど）の合計で、行をタップすると内訳を開閉できます。"
            "件数・売上それぞれに、目標に対する進捗率と「あと◯件／あと◯円」を表示しています。"
            "パイオネックス・お灸は「鍼」に含めています。目標とグループ分けは「目標設定」ページで変更できます。"
        )
        if idle:
            with st.expander(f"今月の実績が無いメニュー（{len(idle)}件）"):
                st.markdown(menu_tree_html(idle, ratio, total, open_top=0), unsafe_allow_html=True)

    # ---- 推移 ----
    section("月別の推移")
    history = []
    for m in months:
        reps = reports_for(m)
        if reps:
            vals = aggregate_values(reps)
            history.append({"月": f"{m.year}-{m.month:02d}", **{k: v[0] for k, v in vals.items()}})
    hist = pd.DataFrame(history)
    if len(hist) < 2:
        st.caption("2ヶ月分以上の月間報告書をアップロードすると、推移グラフが表示されます。")
    else:
        names = [s["name"] for s in catalog]
        t1, t2 = st.columns(2, gap="large")
        with t1:
            item = st.selectbox("項目", names, index=names.index("窓口売上合計"), key="trend_item", label_visibility="collapsed")
            target = ss.kpi_targets.get(item)
            layers = [
                alt.Chart(hist)
                .mark_bar(color="#4e79a7", cornerRadiusEnd=3)
                .encode(
                    x=alt.X("月:N", title=None),
                    y=alt.Y(f"{item}:Q", title=None, axis=alt.Axis(format="~s")),
                    tooltip=["月", alt.Tooltip(f"{item}:Q", format=",.1f")],
                )
            ]
            if target:
                layers.append(alt.Chart(pd.DataFrame({"y": [target]})).mark_rule(color="#2e7d32", strokeDash=[5, 4], size=2).encode(y="y:Q"))
            st.altair_chart(alt.layer(*layers).properties(height=260), width="stretch")
            st.caption(f"{item}（{spec_by_name[item]['unit']}）" + ("・緑の破線＝目標" if target else ""))
        with t2:
            st.markdown("**窓口売上の構成**")
            sales_long = hist.melt(id_vars="月", value_vars=[f"{k}売上" for k in SALES_COLORS if f"{k}売上" in hist.columns],
                                   var_name="区分", value_name="売上")
            sales_long["区分"] = sales_long["区分"].str.replace("売上", "")
            st.altair_chart(
                alt.Chart(sales_long)
                .mark_bar()
                .encode(
                    x=alt.X("月:N", title=None),
                    y=alt.Y("売上:Q", title=None, stack="zero", axis=alt.Axis(format="~s")),
                    color=alt.Color("区分:N", scale=alt.Scale(domain=list(SALES_COLORS), range=list(SALES_COLORS.values())),
                                    legend=alt.Legend(orient="top", title=None)),
                    tooltip=["月", "区分", alt.Tooltip("売上:Q", format=",.0f")],
                )
                .properties(height=232),
                width="stretch",
            )
        if sel_month == months[-1] and ratio < 1:
            st.caption(f"※ {month_label} は月の途中（{ratio:.0%}経過）までの実績です。")

    with st.expander(f"読み込んだ報告書（{len(reports)}件）"):
        if skipped:
            st.caption(f"同じ院・同じ月の報告書が複数あったため、対象期間が最新のものだけを使っています（不使用：{'、'.join(skipped)}）")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "ファイル": r["file"],
                        "対象院": r["clinic"],
                        "対象期間": f"{r['period']['start']:%Y/%m/%d}〜{r['period']['end']:%Y/%m/%d}",
                        "取得できた項目": f"{sum(v['found'] for v in r['values'].values())} / {len(r['values'])}",
                        "使用": "✅" if r in used else "—",
                    }
                    for r in reports
                ]
            ),
            hide_index=True,
            width="stretch",
        )


# ===========================================================================
# ページ：目標設定（目標の入力はここだけ）
# ===========================================================================
def page_targets():
    st.markdown("<div class='page-title'>🎯 目標設定</div>", unsafe_allow_html=True)
    st.markdown(
        "<div class='page-meta'>ここで保存した月間目標は共有データに保存され、全員のダッシュボード（カード・一覧・メニュー別・推移）で使われます。"
        f"参考として {month_label}（{sel_clinic}）と前月の実績を表示しています。</div>",
        unsafe_allow_html=True,
    )
    num = st.column_config.NumberColumn

    kpi_rows = [
        {
            "カテゴリ": spec["category"],
            "項目": spec["name"],
            "単位": spec["unit"],
            "前月実績": prev_values.get(spec["name"], (np.nan,))[0] if prev_values else np.nan,
            "今月実績": values[spec["name"]][0],
            "目標": ss.kpi_targets.get(spec["name"]),
        }
        for spec in catalog
    ]
    kpi_df = pd.DataFrame(kpi_rows)
    kpi_df["目標"] = pd.to_numeric(kpi_df["目標"], errors="coerce")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    kpi_df = kpi_df.sort_values("カテゴリ", key=lambda s: s.map(order).fillna(99), kind="stable").reset_index(drop=True)

    # 施術分類の目標：親メニュー（合計）の行の下に内訳の行を並べる（件数・売上の両方）
    MENU_COLS = ["_key", "_group", "_前月件数", "_前月売上", "階層", "メニュー", "今月件数", "件数目標", "今月売上", "売上目標"]

    def menu_row(key, group, level, label, row):
        return {"_key": key, "_group": group, "_前月件数": row["前月件数"], "_前月売上": row["前月"], "階層": level, "メニュー": label,
                "今月件数": row["人数"], "件数目標": row["件数目標"], "今月売上": row["売上"], "売上目標": row["目標"]}

    menu_rows = []
    for g in menu_tree():
        if g["multi"]:
            # 親の目標：親に直接入れた値、無ければ内訳の目標の合計
            menu_rows.append(menu_row(GROUP_KEY + g["group"], g["group"], "親（合計）", f"■ {g['group']} 全体", g))
            for m in g["members"]:
                menu_rows.append(menu_row(m["name"], g["group"], "内訳", f"　　└ {m['name']}", m))
        else:
            m = g["members"][0]
            menu_rows.append(menu_row(m["name"], g["group"], "単独", f"■ {m['name']}", m))
    menu_df = pd.DataFrame(menu_rows, columns=MENU_COLS)
    for c in ("_前月件数", "_前月売上", "今月件数", "件数目標", "今月売上", "売上目標"):
        menu_df[c] = pd.to_numeric(menu_df[c], errors="coerce")

    with st.form("targets_form", border=False):
        section("KPI項目の目標（月間）", "「目標」の列だけ入力できます。空欄の項目は判定しません")
        kpi_edit = st.data_editor(
            kpi_df if prev_values else kpi_df.drop(columns=["前月実績"]),
            key=f"kpi_target_editor_{ss.target_ver}",
            hide_index=True,
            width="stretch",
            height=min(36 * (len(kpi_df) + 1) + 4, 640),
            disabled=["カテゴリ", "項目", "単位", "前月実績", "今月実績"],
            column_config={
                "カテゴリ": st.column_config.TextColumn(width="small"),
                "項目": st.column_config.TextColumn(width="medium"),
                "単位": st.column_config.TextColumn(width="small"),
                "前月実績": num(format="localized"),
                "今月実績": num(format="localized"),
                "目標": num("🎯 目標", format="localized", min_value=0.0),
            },
        )
        section("施術分類（メニュー）別の目標（月間）", "「件数目標」「売上目標」の列に入力します")
        st.markdown(
            "<div class='page-meta' style='margin:-4px 0 10px'>"
            "・<b>内訳に入れる</b> → 親メニューの目標は、内訳の目標の合計に自動でなります（保存すると更新）<br>"
            "・<b>親メニューに入れる</b> → グループ全体の目標になります。内訳の合計より優先されます<br>"
            "・親メニューを<b>空欄にして保存</b>すると、内訳の合計に戻ります（件数・売上それぞれ別に判定します）</div>",
            unsafe_allow_html=True,
        )
        menu_edit = st.data_editor(
            menu_df,
            key=f"menu_target_editor_{ss.target_ver}",
            hide_index=True,
            width="stretch",
            height=min(36 * (len(menu_df) + 1) + 4, 640),
            column_order=["階層", "メニュー", "今月件数", "件数目標", "今月売上", "売上目標"],
            disabled=["_key", "_group", "_前月件数", "_前月売上", "階層", "メニュー", "今月件数", "今月売上"],
            column_config={
                "階層": st.column_config.TextColumn(width="small"),
                "メニュー": st.column_config.TextColumn(width="medium"),
                "今月件数": num("今月件数（件）", format="localized"),
                "件数目標": num("🎯 件数目標（件）", format="localized", min_value=0.0, step=1.0),
                "今月売上": num("今月売上（円）", format="localized"),
                "売上目標": num("🎯 売上目標（円）", format="localized", min_value=0.0),
            },
        )
        b1, b2, _ = st.columns([1, 1, 3])
        saved = b1.form_submit_button("💾 目標を保存", type="primary", width="stretch")
        fill_prev = b2.form_submit_button("空欄を前月実績で埋める", width="stretch", disabled=not prev_values,
                                          help="目標が空欄の項目に、前月の実績値を仮の目標として入れます（保存も同時に行います）")

    if saved or fill_prev:
        kpi_edit = kpi_edit.copy()
        menu_edit = menu_edit.copy()
        if fill_prev and "前月実績" in kpi_edit.columns:
            kpi_edit["目標"] = kpi_edit["目標"].fillna(kpi_edit["前月実績"])
        leaf = menu_edit["階層"] != "親（合計）"
        if fill_prev:
            menu_edit.loc[leaf, "件数目標"] = menu_edit.loc[leaf, "件数目標"].fillna(menu_edit.loc[leaf, "_前月件数"])
            menu_edit.loc[leaf, "売上目標"] = menu_edit.loc[leaf, "売上目標"].fillna(menu_edit.loc[leaf, "_前月売上"])
        new_kpi = {r["項目"]: float(r["目標"]) for _, r in kpi_edit.iterrows() if not pd.isna(r["目標"]) and r["目標"] > 0}
        new_kpi.update({k: v for k, v in ss.kpi_targets.items() if k not in set(kpi_edit["項目"])})  # 表に無い項目の目標は残す
        shown_keys = set(menu_edit["_key"])

        def collect(column: str, old: dict) -> dict:
            new = {k: v for k, v in old.items() if k not in shown_keys}  # 表示していないメニュー（他院など）の目標は残す
            for _, r in menu_edit[leaf].iterrows():
                if not pd.isna(r[column]) and r[column] > 0:
                    new[r["_key"]] = float(r[column])
            # 親の目標は、内訳の合計と違う値が入っているときだけ「親の目標」として保存する（同じなら内訳の合計に自動で連動）
            for _, r in menu_edit[~leaf].iterrows():
                kids_sum = float(menu_edit[leaf & (menu_edit["_group"] == r["_group"])]["_key"].map(new).fillna(0).sum())
                v = r[column]
                if not pd.isna(v) and v > 0 and abs(v - kids_sum) > 0.5:
                    new[r["_key"]] = float(v)
            return new

        new_sales = collect("売上目標", ss.menu_targets)
        new_count = collect("件数目標", ss.menu_count_targets)
        # 共有データ（Supabase または data/targets.json）へ保存：この画面で変更した目標だけを、最新の内容に重ねて保存する
        apply_diff("targets", "kpi", ss.kpi_targets, new_kpi)
        apply_diff("targets", "menu_sales", ss.menu_targets, new_sales)
        apply_diff("targets", "menu_count", ss.menu_count_targets, new_count)
        saved_now = store_get("targets")
        ss.target_ver += 1
        ss.saved_notice = (
            f"目標を共有データに保存しました（KPI {len(saved_now.get('kpi', {}))}項目・"
            f"メニューの売上目標 {len(saved_now.get('menu_sales', {}))}件・件数目標 {len(saved_now.get('menu_count', {}))}件）。"
        )
        st.rerun()
    if notice := ss.pop("saved_notice", None):
        st.success(notice + " 全員のダッシュボードに反映されます。", icon="✅")
        st.page_link(dashboard_page, label="ダッシュボードで確認する", icon="📊")

    with st.expander("🗂 メニューのグループ分けを調整"):
        st.caption(
            "分類名から「(新規)」「(継続)」や「回数券」「体験」「声掛け」「検査」などを外して、自動で親メニューにまとめています"
            "（パイオネックス・お灸は「鍼」に含めます）。"
            "違うグループに入れたい分類は「親メニュー」を書き換えて保存してください（新しい名前を入れると新しいグループになります）。"
        )
        grp_df = pd.DataFrame(
            {"分類": all_menu_names, "自動の親メニュー": [auto_groups[n] for n in all_menu_names], "親メニュー": [menu_groups[n] for n in all_menu_names]}
        )
        with st.form("group_form", border=False):
            grp_edit = st.data_editor(
                grp_df,
                key=f"group_editor_{ss.target_ver}",
                hide_index=True,
                width="stretch",
                height=min(36 * (len(grp_df) + 1) + 4, 480),
                disabled=["分類", "自動の親メニュー"],
                column_config={"親メニュー": st.column_config.TextColumn("✏️ 親メニュー")},
            )
            g1, g2, _ = st.columns([1, 1, 3])
            save_groups = g1.form_submit_button("グループ分けを保存", width="stretch")
            reset_groups = g2.form_submit_button("自動に戻す", width="stretch")
        if save_groups or reset_groups:
            overrides = {k: v for k, v in ss.menu_groups.items() if k not in set(all_menu_names)}
            if save_groups:
                for _, r in grp_edit.iterrows():
                    parent = str(r["親メニュー"] or "").strip()
                    if parent and parent != auto_groups[r["分類"]]:
                        overrides[r["分類"]] = parent
            apply_diff("config", "menu_groups", ss.menu_groups, overrides)
            ss.target_ver += 1
            st.rerun()

    if supabase_settings():
        local = legacy_local_data()
        n_local = len(local["files"]) + len(local["reports"])
        if local["targets"] or local["config"] or n_local:
            with st.expander("📦 このPCのデータをクラウド（Supabase）へ移行"):
                st.caption(
                    f"このPCに、以前の版で保存した目標（{'あり' if local['targets'] else 'なし'}）・設定（{'あり' if local['config'] else 'なし'}）・"
                    f"報告書 {n_local}件があります。移行すると、目標・設定はクラウドにまだ無い場合だけコピーし、"
                    "報告書は数値を取り出して保存します（同じ院・同じ月は対象期間が新しい方を残します）。"
                )
                if st.button("クラウドへ移行する", type="primary"):
                    done = {"new": 0, "update": 0, "skip": 0}
                    failed = []
                    with st.spinner("移行しています…"):
                        if local["targets"] and not store_get("targets"):
                            store_put("targets", local["targets"])
                        if local["config"] and not store_get("config"):
                            store_put("config", {k: v for k, v in local["config"].items() if k != "manual_periods"})
                        manual = local["config"].get("manual_periods", {})
                        for f in local["files"]:
                            try:
                                ext = extract_file(f.read_bytes(), f.name, custom, CATALOG_SIG)
                            except (OSError, ValueError) as e:
                                failed.append(f"{f.name}（{e}）")
                                continue
                            period = ext["period"] or (
                                {"start": date.fromisoformat(manual[f.name][0]), "end": date.fromisoformat(manual[f.name][1])} if f.name in manual else None
                            )
                            if period is None:
                                failed.append(f"{f.name}（対象期間が不明）")
                                continue
                            done[save_report_row(report_row(f.name, ext, period))] += 1
                        for row in local["reports"].values():
                            done[save_report_row({**row, "uploaded_at": now_iso()})] += 1
                    st.success(f"移行しました：報告書 新規 {done['new']}件・更新 {done['update']}件・見送り {done['skip']}件", icon="✅")
                    for msg in failed:
                        st.warning(f"移行できませんでした：{msg}")

    with st.expander("⚙️ 抽出項目の追加・調整（上級者向け）"):
        st.caption(
            "標準の項目に無いものを追加できます。「行ラベル」と「列ラベル」が交わるセルの数値を取り出します"
            "（列ラベルが空なら、行ラベルの右にある最初の数値）。シート名は一部だけでも構いません。"
            "追加した項目は、保存した後にアップロードした報告書から取り出されます（すでに保存済みの月は、報告書をアップロードし直してください）。"
        )
        custom_base = pd.DataFrame(config.get("custom_items", []), columns=CUSTOM_COLUMNS)
        custom_base["割合を%に"] = custom_base["割合を%に"].fillna(False).astype(bool)
        with st.form("custom_form", border=False):
            custom_df = st.data_editor(
                custom_base,
                key="custom_editor",
                num_rows="dynamic",
                hide_index=True,
                width="stretch",
                column_config={
                    "項目名": st.column_config.TextColumn(required=True),
                    "単位": st.column_config.TextColumn(default="円"),
                    "集計": st.column_config.SelectboxColumn(options=[SUM, MEAN], default=SUM),
                    "シート名": st.column_config.TextColumn(help="例：窓口売上、全体1"),
                    "基準ラベル": st.column_config.TextColumn(help="同じ名前の行が複数ある場合の目印（例：窓口売上）"),
                    "行ラベル": st.column_config.TextColumn(required=True, help="例：全体"),
                    "列ラベル": st.column_config.TextColumn(help="例：自費"),
                    "割合を%に": st.column_config.CheckboxColumn(default=False, help="0.545 → 54.5% に変換"),
                },
            )
            if st.form_submit_button("追加項目を保存"):
                update_shared("config", {"custom_items": custom_df.where(custom_df.notna(), None).to_dict("records")})
                st.rerun()


# ===========================================================================
# ページ切り替え（サイドバー上部）
# ===========================================================================
dashboard_page = st.Page(page_dashboard, title="ダッシュボード", icon="📊", default=True)
target_page = st.Page(page_targets, title="目標設定", icon="🎯", url_path="targets")
st.navigation([dashboard_page, target_page]).run()

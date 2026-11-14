#!/usr/bin/env python3
"""Normalize the downloaded NASA PSI combustion datasets.

Reads data/psi/raw/<ACC>/... and writes cleaned tables into data/psi/processed/:

  * experimental_runs.csv  - one row per record of every "Experimental table" CSV
                             with key variables mapped to a common schema.
  * flex_test_points.csv   - one row per FLEX/FLEX-2 test point parsed from the
                             structured *TestSheet*.txt files (FLEX, PSI-69).
  * xlsx_csv/<acc>/        - sensor/telemetry/analyzed-data workbooks (.xlsx)
                             exploded into plain CSVs, one per sheet.
  * telemetry_index.csv    - index of every telemetry/data file: accession,
                             test-point id, data kind, path, row count, columns.

Usage: python3 data/psi/scripts/psi_normalize.py
"""

import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.abspath(os.path.join(HERE, "..", "raw"))
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "processed"))

ACRONYM = {
    "PSI-69": "FLEX", "PSI-68": "FLEX-2", "PSI-142": "FLEX-2 Cool Flames",
    "PSI-98": "SAFFIRE-I", "PSI-99": "SAFFIRE-II", "PSI-100": "SAFFIRE-III",
    "PSI-10": "ACME Flame Design", "PSI-20": "ACME BRE", "PSI-21": "ACME CLD",
    "PSI-22": "ACME E-FIELD", "PSI-23": "ACME s-Flame", "PSI-159": "ACME CFI-G",
    "PSI-26": "BASS",
}

# ---------------------------------------------------------------- helpers

NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def numbers(text):
    return [float(x) for x in NUM.findall(text or "")]


def rng(text):
    """Parse 'a - b', 'a; b; c', '~a', 'a units' into (min, max)."""
    vals = numbers(text)
    if not vals:
        return None, None
    return min(vals), max(vals)


def first_num(text):
    vals = numbers(text)
    return vals[0] if vals else None


# header keyword -> canonical column. Order matters: first match wins.
# A keyword prefixed with "=" requires an exact (full header) match.
COLUMN_MAP = [
    ("thickness", "sample_thickness_raw"),
    ("=length", "sample_length_raw"),
    ("sample length", "sample_length_raw"),
    ("width", "sample_width_raw"),
    # -- gas mixture composition (FLEX ambient mole fractions; order: co/he/n
    #    before o so "co initial ambient" is not eaten by "o initial ambient")
    ("co initial ambient", "co2_mf_raw"),
    ("he initial ambient", "he_mf_raw"),
    ("n initial ambient", "n2_mf_raw"),
    ("o initial ambient", "o2_mf_raw"),
    ("ambient gas", "gas_mixture_raw"),
    ("atmosphere", "gas_mixture_raw"),
    # -- fuel / sample identity (mfc before fuel: "Fuel MFC" is a setpoint)
    ("mfc", "mfc_raw"),
    ("fuel bottle", "fuel_bottle"),
    ("fuel conc", "fuel_mf_raw"),
    ("xfuel", "fuel_mf_raw"),
    ("fuel", "fuel_or_material"),
    ("material", "fuel_or_material"),
    ("sample", "sample_id"),
    # -- oxygen
    ("percent o2", "o2_pct_raw"),
    ("oxygen conc", "o2_pct_raw"),
    ("oxygen mole fraction", "o2_mf_raw"),
    ("o2 mole fraction", "o2_mf_raw"),
    ("xo2", "o2_mf_raw"),
    # -- airflow / direction
    ("air flow", "airflow_raw"),
    ("flow velocity", "airflow_raw"),
    ("flow direction", "flow_direction"),
    ("direction", "flow_direction"),
    # -- pressure (unit-aware: mmHg and bar converted to atm below)
    ("mmhg", "pressure_mmhg_raw"),
    ("(bar)", "pressure_bar_raw"),
    ("(atm)", "pressure_raw"),
    ("ambient pressure", "pressure_raw"),
    ("pressure", "pressure_raw"),
    # -- temperature / geometry
    ("ambient temperature", "ambient_temp_raw"),
    ("temperature (k)", "temperature_k_raw"),
    ("tad", "temperature_k_raw"),
    ("extinction diameter", "dext_raw"),
    ("droplet", "d0_raw"),
    ("burner size", "burner_size_raw"),
    ("burn length", "burn_length_raw"),
    ("spread length", "spread_length_raw"),
    ("spread rate", "spread_rate_raw"),
    # -- combustion behaviour
    ("cool flame", "cool_flame_flag"),
    ("self", "extinction_mode"),
    ("hot ignition", "ignition_flag"),
    ("ignition power", "ignition_power_raw"),
    ("ignition time", "ignition_time_raw"),
    ("burn time", "burn_time_raw"),
    ("flames ignited", "flames_ignited_raw"),
    ("flame type", "flame_type"),
    ("test type", "test_type"),
    ("flex test", "data_id"),
    ("flex identifier", "data_id"),
    ("test #", "data_id"),
    ("=test", "data_id"),
    ("zst", "zst"),
    ("tfp", "tfp"),
    ("mg/s", "mass_flow_mg_s_raw"),
    # -- dates / bookkeeping
    ("year", "year_raw"),
    ("month", "month_raw"),
    ("date", "date_raw"),
    ("notes", "notes"),
    ("comments", "comments"),
    ("camera", None),          # cameras are file refs, drop
    ("data id", "data_id"),
    ("data description", "notes"),
    ("reference publication", "reference_doi"),
    ("figure id", "figure_id"),
]

# headers like "XC2H4 initial", "Xf before test" = fuel mole fraction
X_FUEL_RE = re.compile(r"^x[a-z0-9]+($| (before|after|initial|final))")

CANON = ["accession", "acronym", "source_table", "row_idx", "data_id",
         "flame_type", "test_type",
         "sample_id", "fuel_or_material", "fuel_bottle", "fuel_mf_raw",
         "gas_mixture_raw", "mfc_raw", "mass_flow_mg_s_raw",
         "o2_pct_raw", "o2_pct_min", "o2_pct_max",
         "o2_mf_raw", "o2_mf_min", "o2_mf_max",
         "n2_mf_raw", "co2_mf_raw", "he_mf_raw",
         "airflow_raw", "airflow_cm_s_min", "airflow_cm_s_max",
         "flow_direction",
         "pressure_raw", "pressure_bar_raw", "pressure_mmhg_raw",
         "pressure_atm_min", "pressure_atm_max",
         "ambient_temp_raw", "temperature_k_raw",
         "sample_thickness_raw", "sample_length_raw", "sample_width_raw",
         "d0_raw", "d0_mm_min", "d0_mm_max",
         "dext_raw", "dext_mm_min", "dext_mm_max",
         "burner_size_raw", "zst", "tfp",
         "ignition_power_raw", "ignition_power_w",
         "ignition_time_raw", "ignition_time_s", "ignition_flag",
         "burn_time_raw", "burn_time_s",
         "extinction_mode", "cool_flame_flag",
         "burn_length_raw", "spread_length_raw", "spread_rate_raw",
         "flames_ignited_raw", "date_raw", "year_raw", "month_raw",
         "notes", "comments", "reference_doi", "figure_id", "extra_json"]

BAR_TO_ATM = 0.986923
MMHG_TO_ATM = 1.0 / 760.0


def normalize_table(path, accession):
    """Map one Experimental-table CSV onto the common schema."""
    rows = []
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        reader = csv.reader(fh)
        try:
            header = next(reader)
        except StopIteration:
            return rows
        mapping = []
        for h in header:
            hl = re.sub(r"\s+", " ", h.strip().lower())
            canon = None
            for kw, col in COLUMN_MAP:
                if kw.startswith("="):
                    if hl == kw[1:]:
                        canon = col
                        break
                elif kw in hl:
                    canon = col
                    break
            if canon is None and X_FUEL_RE.match(hl):
                canon = "fuel_mf_raw"
            mapping.append(canon)
        for i, r in enumerate(reader):
            if not any(c.strip() for c in r):
                continue
            out = {c: "" for c in CANON}
            extra = {}
            for j, cell in enumerate(r):
                canon = mapping[j] if j < len(mapping) else None
                if canon:
                    out[canon] = (out[canon] + "; " if out[canon] else "") + cell.strip()
                elif cell.strip():
                    extra[header[j].strip() if j < len(header) else f"col{j}"] = cell.strip()
            out["accession"] = accession
            out["acronym"] = ACRONYM.get(accession, "")
            out["source_table"] = os.path.relpath(path, RAW_DIR)
            out["row_idx"] = i
            for raw, lo, hi in [
                ("o2_pct_raw", "o2_pct_min", "o2_pct_max"),
                ("o2_mf_raw", "o2_mf_min", "o2_mf_max"),
                ("airflow_raw", "airflow_cm_s_min", "airflow_cm_s_max"),
                ("d0_raw", "d0_mm_min", "d0_mm_max"),
                ("dext_raw", "dext_mm_min", "dext_mm_max"),
            ]:
                out[lo], out[hi] = rng(out[raw])
            # pressure: merge atm / bar / mmHg sources into atm range
            lo_vals, hi_vals = [], []
            for raw, factor in [("pressure_raw", 1.0),
                                ("pressure_bar_raw", BAR_TO_ATM),
                                ("pressure_mmhg_raw", MMHG_TO_ATM)]:
                lo, hi = rng(out[raw])
                if lo is not None:
                    lo_vals.append(lo * factor)
                    hi_vals.append(hi * factor)
            if lo_vals:
                out["pressure_atm_min"] = round(min(lo_vals), 5)
                out["pressure_atm_max"] = round(max(hi_vals), 5)
            # plausibility guards: mole fraction <=1, percent <=100, atm >0
            if out["o2_mf_max"] and float(out["o2_mf_max"]) > 1.0:
                out["o2_mf_min"] = out["o2_mf_max"] = ""
            if out["o2_pct_max"] and float(out["o2_pct_max"]) > 100.0:
                out["o2_pct_min"] = out["o2_pct_max"] = ""
            if out["pressure_atm_min"] != "" and \
                    not 0 < float(out["pressure_atm_min"]) <= 10:
                out["pressure_atm_min"] = out["pressure_atm_max"] = ""
            out["ignition_power_w"] = first_num(out.get("ignition_power_raw", ""))
            out["ignition_time_s"] = first_num(out.get("ignition_time_raw", ""))
            out["burn_time_s"] = first_num(out.get("burn_time_raw", ""))
            out["extra_json"] = json.dumps(extra, ensure_ascii=False) if extra else ""
            rows.append(out)
    return rows


# ------------------------------------------------------------- FLEX sheets

FIELD_RE = re.compile(r"^\s*([A-Za-z0-9_ ()/%\-\.]+?)\s*[=:]\s*(.*)$")

TS_FIELDS = {
    "test date": "test_date", "test time": "test_time",
    "cir test number": "cir_test_number",
    "pressure (atm)": "pressure_atm",
    "o2 mole fraction": "o2_mf", "n2 mole fraction": "n2_mf",
    "co2 mole fraction": "co2_mf", "he mole fraction": "he_mf",
    "temperature (k)": "temperature_k",
    "fuel": "fuel_or_material",
    "d0  (mm)": "d0_mm", "d0 (mm)": "d0_mm",
    "kavg  (mm2/s)": "kavg_mm2_s", "kavg (mm2/s)": "kavg_mm2_s",
    "fiber": "fiber", "dext  (mm)": "dext_mm", "dext (mm)": "dext_mm",
}

FLEX_COLS = ["accession", "acronym", "test_id", "cir_test_number", "test_date",
             "test_time", "fuel_or_material", "d0_mm", "kavg_mm2_s", "dext_mm",
             "pressure_atm", "o2_mf", "n2_mf", "co2_mf", "he_mf",
             "temperature_k", "fiber", "comments", "source_file"]


def parse_testsheet(path, accession):
    out = {c: "" for c in FLEX_COLS}
    out["accession"] = accession
    out["acronym"] = ACRIM = ACRONYM.get(accession, "")
    base = os.path.basename(path)
    m = re.search(r"(FLEX-?\d+|[A-Z]\d{3}[A-Z]\d{2}[A-Z]?)", base)
    out["test_id"] = m.group(1) if m else base.rsplit("_", 1)[0]
    out["source_file"] = os.path.relpath(path, RAW_DIR)
    section = None
    comments = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            s = line.rstrip("\n")
            if s.strip().upper().startswith("COMMENTS"):
                section = "comments"
                continue
            if section == "comments":
                comments.append(s.strip())
                continue
            kv = FIELD_RE.match(s)
            if kv:
                key = kv.group(1).strip().lower()
                key = re.sub(r"\s+", " ", key)
                if key in TS_FIELDS:
                    out[TS_FIELDS[key]] = kv.group(2).strip()
            elif s.strip() and not out["test_id"] and re.match(r"FLEX-?\d+", s.strip()):
                out["test_id"] = s.strip()
    out["comments"] = " ".join(c for c in comments if c)
    return out


# ------------------------------------------------------------- index files

DATA_KIND = [
    (re.compile(r"testsheet", re.I), "test_sheet"),
    (re.compile(r"cool_?flames", re.I), "cool_flames"),
    (re.compile(r"dropletdata|drolethistory|droplet", re.I), "droplet_data"),
    (re.compile(r"lluvdata|llluv", re.I), "flame_diameter"),
    (re.compile(r"colorcamdata|color_camera", re.I), "camera_data"),
    (re.compile(r"camera_settings", re.I), "camera_settings"),
    (re.compile(r"testpoint_settings", re.I), "testpoint_settings"),
    (re.compile(r"chamber_readings", re.I), "chamber_readings"),
    (re.compile(r"radiometer", re.I), "radiometer"),
    (re.compile(r"mixture|miXture", re.I), "gas_mixture"),
    (re.compile(r"sensor|telemetry", re.I), "sensor_telemetry"),
    (re.compile(r"comments", re.I), "comments"),
    (re.compile(r"_data\.csv$", re.I), "run_data_csv"),
    (re.compile(r"mfcsetpoints", re.I), "mfc_setpoints"),
    (re.compile(r"test parameter|test sheets|daily test", re.I), "test_parameters"),
    (re.compile(r"as run", re.I), "as_run"),
]


def data_kind(name):
    for rx, kind in DATA_KIND:
        if rx.search(name):
            return kind
    return "other"


def test_point(name, accession):
    """Extract the run/test-point designator from a raw filename.

    Real formats seen in the corpus: C13M103 / C05M201 (CIR-style),
    305F003 / D033E08 / A158R14 (letter+digits), 19189A1 / 21301A9 / 22024K2
    (5 digits + letter + digit), FLEX-159, plain 19189. `search` (not
    `match`) so ids embedded in names like `as run21301A9` are still found.
    """
    base = re.sub(r"^PSI-\d+_Raw Data_", "", name)
    m = re.search(
        r"([A-Z]?\d{2,5}[A-Z]\d{1,3}[A-Z]?|FLEX-?\d+|LCTF\d+[A-Z]?|\d{5})",
        base)
    return m.group(1) if m else ""


def sniff_csv(path, max_bytes=65536):
    """Return (n_rows_estimate, header_cols) for csv/txt tabular files."""
    try:
        with open(path, "rb") as fh:
            chunk = fh.read(max_bytes)
        text = chunk.decode("utf-8", errors="replace")
        lines = [l for l in text.splitlines() if l.strip()]
        if not lines:
            return 0, ""
        header = lines[0]
        delim = "\t" if header.count("\t") > header.count(",") else ","
        cols = [c.strip().strip('"') for c in header.split(delim)][:40]
        return len(lines) - 1, delim.join(cols)
    except OSError:
        return None, ""


def extract_xlsx(path, acc, rel):
    """Explode a workbook into processed/xlsx_csv/<acc>/<stem>__<sheet>.csv."""
    import openpyxl  # deferred: only needed for the sensor workbooks

    out_dir = os.path.join(OUT_DIR, "xlsx_csv", acc)
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", os.path.splitext(os.path.basename(path))[0])
    written = []
    if os.path.isdir(out_dir):
        # resume: sheets already exported -> recount rows, skip the workbook
        existing = [f for f in os.listdir(out_dir) if f.startswith(stem + "__")]
        if existing:
            for f in existing:
                dest = os.path.join(out_dir, f)
                with open(dest, "rb") as fh:
                    written.append((dest, max(0, sum(1 for _ in fh) - 0)))
            return written
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001
        print(f"  xlsx error {rel}: {e}")
        return written
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        if not hasattr(ws, "iter_rows"):  # chartsheet - nothing to export
            continue
        name = re.sub(r"[^A-Za-z0-9_.-]+", "_", sheet)[:60]
        dest = os.path.join(out_dir, f"{stem}__{name}.csv")
        os.makedirs(out_dir, exist_ok=True)
        n = 0
        with open(dest, "w", newline="") as fh:
            w = csv.writer(fh)
            for row in ws.iter_rows(values_only=True):
                if not any(v is not None and str(v).strip() for v in row):
                    continue
                w.writerow(["" if v is None else v for v in row])
                n += 1
        if n:
            written.append((dest, n))
        else:
            os.remove(dest)
    wb.close()
    return written


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    exp_rows, flex_rows, idx_rows = [], [], []
    xlsx_files = 0

    for acc in sorted(os.listdir(RAW_DIR)):
        acc_dir = os.path.join(RAW_DIR, acc)
        if not os.path.isdir(acc_dir):
            continue
        for dirpath, _dirs, files in os.walk(acc_dir):
            for name in files:
                path = os.path.join(dirpath, name)
                rel = os.path.relpath(path, RAW_DIR)
                cat = os.path.relpath(dirpath, acc_dir).split(os.sep)[0]
                ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
                if cat == "Experimental table" and ext == "csv":
                    exp_rows.extend(normalize_table(path, acc))
                if ext == "txt" and "TestSheet" in name:
                    flex_rows.append(parse_testsheet(path, acc))
                if cat == "Raw Data" and ext in ("csv", "txt", "asc", "dat", "xlsx", "log"):
                    n_rows, cols = ("", "") if ext == "xlsx" else sniff_csv(path)
                    if ext == "xlsx":
                        sheets = extract_xlsx(path, acc, rel)
                        xlsx_files += len(sheets)
                        cols = "; ".join(os.path.basename(d) for d, _n in sheets)
                        n_rows = sum(n for _d, n in sheets)
                    idx_rows.append({
                        "accession": acc,
                        "acronym": ACRONYM.get(acc, ""),
                        "test_point": test_point(name, acc),
                        "data_kind": data_kind(name),
                        "file": rel,
                        "size_bytes": os.path.getsize(path),
                        "n_rows": n_rows,
                        "columns": cols,
                    })

    def dump(name, rows, cols):
        with open(os.path.join(OUT_DIR, name), "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
        print(f"{name}: {len(rows)} rows")

    # Analyzed/science/engineering workbooks are normalized documents, not raw
    # telemetry - explode them so dashboards can read them without openpyxl.
    for acc in sorted(os.listdir(RAW_DIR)):
        for sub in ("Analyzed Data", "Science Documents", "Engineering Documents"):
            adir = os.path.join(RAW_DIR, acc, sub)
            if not os.path.isdir(adir):
                continue
            for name in os.listdir(adir):
                if name.lower().endswith((".xlsx", ".xls")):
                    extract_xlsx(os.path.join(adir, name), acc,
                                 os.path.join(acc, sub, name))

    dump("experimental_runs.csv", exp_rows, CANON)
    dump("flex_test_points.csv", flex_rows, FLEX_COLS)
    dump("telemetry_index.csv", idx_rows,
         ["accession", "acronym", "test_point", "data_kind", "file",
          "size_bytes", "n_rows", "columns"])


if __name__ == "__main__":
    main()

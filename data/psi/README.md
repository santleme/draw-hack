# NASA PSI combustion datasets

Real microgravity combustion data downloaded from the public
[NASA Physical Sciences Informatics (PSI) repository](https://psi.nasa.gov/physci/repo)
and normalized for the fire-risk dashboard, search layer and cabin-risk simulator.

## What is here

| Folder | Contents | Committed? |
| --- | --- | --- |
| `raw/` | Original files as downloaded from PSI, grouped by investigation (`<ACC>/<category>/`) | no (`.gitignore`) — re-fetch with `psi_fetch.py` |
| `catalog/` | `investigations.csv` (one row per investigation), `files_manifest.csv` (one row per downloaded file), `data_dictionary.md` | yes |
| `processed/` | Cleaned tables ready to consume: `experimental_runs.csv`, `flex_test_points.csv`, `telemetry_index.csv`, `xlsx_csv/` | yes, except `xlsx_csv/` |
| `scripts/` | Reproducible pipeline (`psi_fetch.py`, `psi_normalize.py`, `psi_catalog.py`) | yes |

## Investigations covered

13 combustion-science investigations, centred on the three families named in
the challenge (FLEX, SAFFIRE, ACME) plus the closely related BASS program:

- **FLEX / FLEX-2 / cool flames** — `PSI-69`, `PSI-68`, `PSI-142`: droplet
  burning, extinction diameter (Dext), cool-flame triggers.
- **SAFFIRE I/II/III** — `PSI-98`, `PSI-99`, `PSI-100`: large-scale fires inside
  Cygnus vehicles; airflow, O₂/CO₂, thermocouple and radiometer telemetry.
- **ACME** — `PSI-10`, `PSI-20`, `PSI-21`, `PSI-22`, `PSI-23`, `PSI-159`:
  gaseous flames, soot limits, electric-field effects, cool flames in gases.
- **BASS** — `PSI-26`: burning and suppression of solid materials.

## Refresh / reproduce

```sh
# 1. download (resumable; ~20k files, a few GB)
python3 data/psi/scripts/psi_fetch.py

# 2. rebuild the catalog row-per-investigation table
python3 data/psi/scripts/psi_catalog.py

# 3. normalize everything into processed/*.csv
python3 data/psi/scripts/psi_normalize.py   # needs: pandas, openpyxl
```

`psi_fetch.py` talks directly to the PSI `geode-py` API — no login is needed for
public investigations. Large video/image archives are deliberately excluded;
the policy is documented inside the script.

## License / attribution

All PSI investigations are released under **CC0-1.0**. Cite the investigation
DOIs listed in `catalog/investigations.csv` when publishing results.

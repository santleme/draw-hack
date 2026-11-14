# Data dictionary — `data/psi/processed/`

## `experimental_runs.csv`

One row per record of every PSI "Experimental table" CSV — the per-run
condition summaries published for each investigation. Columns that only make
sense for some investigations stay empty; nothing is invented.

Identity / provenance:

| column | meaning |
| --- | --- |
| `accession` | PSI investigation id (e.g. `PSI-98`) |
| `acronym` | experiment acronym (e.g. `SAFFIRE-I`) |
| `source_table` | path of the source CSV under `raw/` |
| `row_idx` | row number inside that table |
| `data_id` | run / test id (`Test`, `Test #`, `FLEX Test #`, `Data ID`) |
| `flame_type` | `Normal` / `Inverse` (ACME burner configuration) |
| `test_type` | ACME test-day type label |
| `sample_id` | sample / test-point id when the table has one |

Conditions (each `*_raw` column keeps the verbatim cell; the paired
`*_min` / `*_max` columns are the parsed numeric range):

| column | unit |
| --- | --- |
| `fuel_or_material` | free text (fuel species or solid material) |
| `fuel_bottle` | ACME fuel bottle composition, e.g. `100% C2H4` |
| `fuel_mf_raw` | fuel mole fraction / concentration (`Xfuel`, `XC2H4`, `Fuel conc`) |
| `gas_mixture_raw` | ambient gas description, e.g. `O2/N2 or O2/He` |
| `mfc_raw` | mass-flow-controller setpoints |
| `mass_flow_mg_s_raw` | gas mass flows, mg/s (`mO2`, `mN2`, `mfuel`, `mHC`…) |
| `o2_pct_min` / `o2_pct_max` | oxygen concentration, % (values >100 dropped as bad data) |
| `o2_mf_min` / `o2_mf_max` | oxygen mole fraction, 0–1 (`XO2`, `O initial ambient…`) |
| `n2_mf_raw`, `co2_mf_raw`, `he_mf_raw` | diluent mole fractions (FLEX) |
| `airflow_cm_s_min` / `airflow_cm_s_max` | imposed flow velocity, cm/s |
| `flow_direction` | `Concurrent` / `Opposed` (SAFFIRE) |
| `pressure_raw` / `pressure_bar_raw` / `pressure_mmhg_raw` | verbatim pressures |
| `pressure_atm_min` / `pressure_atm_max` | ambient pressure, atm (bar ×0.987, mmHg ÷760; zeros dropped) |
| `ambient_temp_raw` | ambient temperature, °C |
| `temperature_k_raw` | flame/ambient temperature, K (`Tad` = adiabatic flame temp) |
| `d0_mm_min` / `d0_mm_max` | initial droplet diameter, mm |
| `dext_mm_min` / `dext_mm_max` | flame extinction diameter $d_e$, mm (`0` = no extinction observed) |
| `burner_size_raw` | ACME burner diameter, mm |
| `zst` | stoichiometric mixture fraction |
| `tfp` | flame temperature parameter (ACME) |

Outcomes:

| column | unit |
| --- | --- |
| `ignition_power_w` | igniter power, W |
| `ignition_time_s` | igniter on-time, s |
| `ignition_flag` | hot-ignition flag (ACME CFI-G) |
| `burn_time_s` | visible burn duration, s |
| `extinction_mode` | `SE` self-extinguished vs `FT` flow-terminated (CFI-G) |
| `cool_flame_flag` | cool-flame observation (`yes, PCI-*` / `no`) |
| `burn_length_raw`, `spread_length_raw`, `spread_rate_raw` | SAFFIRE-II burn/spread geometry |
| `flames_ignited_raw` | flames ignited that day (ACME BRE/CLD/E-FIELD/s-Flame) |
| `notes` / `comments` | verbatim investigator notes |
| `reference_doi`, `figure_id` | publication link / figure (PSI-142) |
| `extra_json` | every source column not mapped above, as JSON |

## `flex_test_points.csv`

One row per FLEX (PSI-69) test point, parsed from the structured
`*_TestSheet.txt` files — the richest per-run record in the dataset.

| column | unit / meaning |
| --- | --- |
| `test_id` | e.g. `FLEX-159` (from the file/sheet) |
| `cir_test_number` | CIR test designator, e.g. `C05M201` |
| `test_date`, `test_time` | GMT timestamp |
| `fuel_or_material` | droplet fuel |
| `d0_mm` | initial droplet diameter, mm |
| `kavg_mm2_s` | average burning-rate constant, mm²/s |
| `dext_mm` | extinction diameter ($d_e$), mm — empty when the droplet burned out |
| `pressure_atm` | ambient pressure, atm |
| `o2_mf`, `n2_mf`, `co2_mf`, `he_mf` | ambient gas mole fractions |
| `temperature_k` | ambient temperature, K |
| `fiber` | fiber-supported droplet? (`Yes`/`No`) |
| `comments` | full investigator comment text |

## `telemetry_index.csv`

Index over every telemetry/data file in `raw/` — this is the catalogue the
search/ranking layer should answer from.

| column | meaning |
| --- | --- |
| `test_point` | test-point designator parsed from the filename (e.g. `A158R14`) |
| `data_kind` | `test_sheet`, `droplet_data`, `flame_diameter`, `camera_data`, `camera_settings`, `testpoint_settings`, `chamber_readings`, `radiometer`, `gas_mixture`, `sensor_telemetry`, `comments`, `run_data_csv`, `mfc_setpoints`, `test_parameters`, `as_run`, `cool_flames`, `other` |
| `file` | path under `raw/` |
| `n_rows`, `columns` | sniffed row count + header (blank for binary sources) |

## `xlsx_csv/<ACC>/*.csv`

Every `.xlsx` workbook (SAFFIRE sensor telemetry, telemetry summaries,
`Analyzed Data` summaries, science-document tables) exploded to plain CSV —
one file per worksheet. Filenames: `<workbook>__<sheet>.csv`. Not committed to
git (regenerate with `psi_normalize.py`); these feed the risk-simulator curves
and the RAG evidence store.

## `catalog/investigations.csv`

One row per investigation: accession, title, acronym, DOI, repository URL,
research area, platform, dates, keywords, objectives/approach text, and local
download stats (`n_files_downloaded`, `bytes_downloaded`).

## `catalog/files_manifest.csv`

One row per downloaded file: accession, repository version, PSI file id,
category, original `key`, filename, declared size, PSI updated timestamp, and
the local `local_path`.

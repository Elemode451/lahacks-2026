# TRIBE v2 — Brain Visualization: API Description & Links

## What Is It

TRIBE v2 is Meta FAIR's open-source foundation model that predicts whole-brain fMRI responses to video, audio, and text stimuli. It maps ~20k cortical vertices (fsaverage5 mesh) and can render 3D brain surface visualizations showing predicted vs. actual neural activity — the same colorful brain heatmaps you see in the [interactive demo](https://aidemos.atmeta.com/tribev2/).

**License:** CC-BY-NC-4.0 (non-commercial use)

---

## Key Links

| Resource | URL |
|---|---|
| **GitHub Repo** | https://github.com/facebookresearch/tribev2 |
| **HuggingFace Weights** | https://huggingface.co/facebook/tribev2 |
| **Colab Demo Notebook** (brain viz walkthrough) | https://colab.research.google.com/github/facebookresearch/tribev2/blob/main/tribe_demo.ipynb |
| **Interactive Web Demo** (Meta-hosted, NOT open source) | https://aidemos.atmeta.com/tribev2/ |
| **Paper** | https://ai.meta.com/research/publications/a-foundation-model-of-vision-audition-and-language-for-in-silico-neuroscience/ |

---

## Important Distinction: Two "Brain Visualizations"

1. **The interactive 3D web demo** at `aidemos.atmeta.com/tribev2` (the spinning brain with Open/Close, Normal/Inflated toggles) — this is Meta's **proprietary** frontend. Its source code is **NOT** in the open-source repo. It's likely built with Three.js/WebGL but the code isn't published.

2. **The Python-based brain visualization** in the open-source repo (`tribev2/plotting/`) — this renders the **same brain surface heatmaps** using PyVista and Nilearn. This IS open source and produces the same visual output (cortical surface with activation colors). It renders to static images or can be used interactively with PyVista's 3D viewer.

---

## Installation

```bash
# Clone the repo
git clone https://github.com/facebookresearch/tribev2.git
cd tribev2

# Basic install (inference only)
pip install -e .

# With brain visualization support
pip install -e ".[plotting]"

# With training dependencies
pip install -e ".[training]"
```

**Requirements:** Python 3.11+, PyTorch >= 2.5.1

**Plotting dependencies:** nibabel, matplotlib, seaborn, colorcet, nilearn, scipy, pyvista, scikit-image

---

## API Description

### 1. Core Inference API (`tribev2.demo_utils.TribeModel`)

The main entry point. Wraps the model for easy inference.

```python
from tribev2 import TribeModel

# Load pretrained model from HuggingFace
model = TribeModel.from_pretrained(
    checkpoint_dir="facebook/tribev2",  # HF repo ID or local path
    checkpoint_name="best.ckpt",         # checkpoint filename
    cache_folder="./cache",              # feature cache dir
    device="auto",                       # "auto", "cuda", or "cpu"
)
```

#### `TribeModel.from_pretrained(checkpoint_dir, ...)`
- **checkpoint_dir** (`str | Path`): HuggingFace repo ID (e.g. `"facebook/tribev2"`) or local directory with `config.yaml` + checkpoint.
- **checkpoint_name** (`str`): Default `"best.ckpt"`.
- **cache_folder** (`str | Path`): Directory to cache extracted features. Default `"./cache"`.
- **device** (`str`): `"auto"` (uses CUDA if available), `"cuda"`, or `"cpu"`.
- **config_update** (`dict | None`): Optional config overrides.
- **Returns:** `TribeModel` instance ready for inference.

#### `model.get_events_dataframe(text_path=None, audio_path=None, video_path=None)`
Builds an events DataFrame from **exactly one** input source.
- **text_path**: Path to `.txt` file (auto-converted to speech, then transcribed for word-level events).
- **audio_path**: Path to `.wav`, `.mp3`, `.flac`, `.ogg`.
- **video_path**: Path to `.mp4`, `.avi`, `.mkv`, `.mov`, `.webm`.
- **Returns:** `pd.DataFrame` with columns: `type`, `filepath`, `start`, `duration`, `timeline`, `subject`.

#### `model.predict(events, verbose=True)`
Runs inference on the events DataFrame.
- **events** (`pd.DataFrame`): From `get_events_dataframe()`.
- **verbose** (`bool`): Show tqdm progress bar.
- **Returns:** `(preds, segments)` where:
  - `preds`: `np.ndarray` of shape `(n_timesteps, n_vertices)` — predicted brain activity on fsaverage5 mesh (~20k vertices).
  - `segments`: List of segment objects aligned with predictions.

### Minimal Inference Example

```python
from tribev2 import TribeModel

model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")
df = model.get_events_dataframe(video_path="path/to/video.mp4")
preds, segments = model.predict(events=df)
print(preds.shape)  # (n_timesteps, ~20000)
```

---

### 2. Brain Visualization API (`tribev2.plotting`)

Two rendering backends, same interface:

| Class | Backend | File |
|---|---|---|
| `PlotBrainPyvista` (default, aliased as `PlotBrain`) | PyVista (off-screen 3D) | `tribev2/plotting/cortical_pv.py` |
| `PlotBrainNilearn` | Nilearn + Matplotlib 3D | `tribev2/plotting/cortical.py` |

#### `PlotBrain` / `PlotBrainPyvista` / `PlotBrainNilearn`

```python
from tribev2.plotting import PlotBrain  # = PlotBrainPyvista

brain = PlotBrain(
    mesh="fsaverage5",        # "fsaverage3" through "fsaverage7"
    inflate=True,             # True, False, or "half" (default "half")
    bg_map="sulcal",          # "sulcal", "curvature", or "thresholded"
    hemisphere_gap=0,         # spacing between hemispheres
)
```

##### `brain.plot_surf(data, axes, views, cmap, ...)`
Renders cortical surface with scalar activation data.
- **data** (`np.ndarray`): Activation values per vertex.
- **axes**: Matplotlib axes (one per view).
- **views** (`str | list[str]`): View angle(s). Options: `"left"`, `"right"`, `"medial_left"`, `"medial_right"`, `"dorsal"`, `"ventral"`, `"anterior"`, `"posterior"`.
- **cmap** (`str`): Colormap name (e.g. `"hot"`, `"seismic"`, `"bwr"`).
- **vmin/vmax** (`float`): Colorbar range.
- **threshold** (`float`): Threshold for transparency.
- **symmetric_cbar** (`bool`): Center colorbar at 0.
- **norm_percentile** (`float`): Robust normalization percentile.
- **annotated_rois** (`list[str] | dict`): HCP ROI labels to annotate on the brain.
- **Returns:** `ScalarMappable` for colorbar.

##### `brain.plot_surf_rgb(signals, views, cmap, ...)`
Renders multi-channel (RGB) activation maps on the cortical surface. Useful for comparing multiple signals overlaid as color channels.
- **signals** (`list[np.ndarray]`): List of 2-3 activation arrays (mapped to R, G, B).
- **views** (`list[str]`): View angle(s).
- **cmap**: `"rgb"`, `"rgb_argmax"`, or `"tab10"`.
- **norm_percentile** (`float`): Default 95.

#### Subcortical Visualization (`tribev2.plotting.subcortical`)

```python
from tribev2.plotting import plot_subcortical

plot_subcortical(
    data,            # voxel-level activation values
    views=["left"],  # view angles
    labels=None,     # specific subcortical labels to show
    cmap="hot",
)
```

Renders subcortical structures (thalamus, putamen, caudate, etc.) using the Harvard-Oxford atlas + marching cubes meshing + PyVista.

#### Visualization Utilities (`tribev2.plotting.utils`)

- `robust_normalize(array, percentile=99)` — Outlier-robust normalization.
- `get_cmap(name, alpha_cmap=None)` — Get colormap by name (supports matplotlib, seaborn, colorcet).
- `get_scalar_mappable(data, cmap, vmin, vmax, ...)` — Build ScalarMappable for colorbars.
- `saturate_colors(rgb, factor)` — Boost/reduce color saturation.
- `combine_mosaics(...)` — Combine multiple brain views into a mosaic image.
- `tight_crop(img, w_pad, h_pad)` — Crop whitespace from rendered images.

---

### 3. Model Architecture (`tribev2/model.py`)

The core model is `FmriEncoder`, a Transformer-based architecture with three stages:
1. **Tri-modal encoding**: Uses pretrained embeddings from LLaMA 3.2 (text), V-JEPA2 (video), Wav2Vec-BERT (audio).
2. **Universal integration**: Transformer that learns shared representations across modalities/subjects.
3. **Brain mapping**: Subject-specific linear layer mapping to ~20k fsaverage5 vertices.

---

### 4. Training API

```bash
# Set paths
export DATAPATH="/path/to/studies"
export SAVEPATH="/path/to/output"

# Local test run
python -m tribev2.grids.test_run

# Full grid search on Slurm
python -m tribev2.grids.run_cortical
python -m tribev2.grids.run_subcortical
```

Requires HuggingFace authentication for LLaMA 3.2 access:
```bash
huggingface-cli login
```

---

### 5. Data Pipeline

Key classes and functions:
- `get_audio_and_text_events(events_df)` — Full pipeline: extract audio from video → chunk → transcribe → add sentence/context annotations.
- `TextToEvents(text=..., infra=...)` — Convert raw text → TTS audio → word-level events.
- `ExtractWordsFromAudio()` — Transcribe audio to word-level timestamps.
- Event types: `"Audio"`, `"Video"`, `"Word"`, `"Text"`.

---

## Project Structure

```
tribev2/
├── main.py              # Experiment pipeline: Data, TribeExperiment
├── model.py             # FmriEncoder: Transformer-based multimodal→fMRI model
├── pl_module.py         # PyTorch Lightning training module
├── demo_utils.py        # TribeModel: from_pretrained / predict / get_events_dataframe
├── eventstransforms.py  # Custom event transforms (word extraction, chunking)
├── utils.py             # Multi-study loading, splitting, subject weighting
├── utils_fmri.py        # Surface projection (MNI/fsaverage) and ROI analysis
├── grids/
│   ├── defaults.py      # Full default experiment configuration
│   └── test_run.py      # Quick local test entry point
├── plotting/
│   ├── __init__.py      # Exports: PlotBrain, PlotBrainPyvista, PlotBrainNilearn, plot_subcortical
│   ├── base.py          # BasePlotBrain: mesh loading, atlas helpers, vol-to-surf
│   ├── cortical.py      # PlotBrainNilearn: Nilearn/matplotlib backend
│   ├── cortical_pv.py   # PlotBrainPyvista: PyVista backend (default)
│   ├── subcortical.py   # Subcortical structure rendering (Harvard-Oxford atlas)
│   └── utils.py         # Colormaps, normalization, cropping, mosaics
└── studies/             # Dataset definitions (Algonauts2025, Lahner2024, …)
```

---

## Quick Start for Devin

To get the brain visualization running:

```bash
# 1. Clone and install
git clone https://github.com/facebookresearch/tribev2.git
cd tribev2
pip install -e ".[plotting]"

# 2. Run the Colab notebook locally or in Colab
# https://colab.research.google.com/github/facebookresearch/tribev2/blob/main/tribe_demo.ipynb

# 3. Minimal Python script:
```

```python
from tribev2 import TribeModel
from tribev2.plotting import PlotBrain
import matplotlib.pyplot as plt

# Load model
model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="./cache")

# Predict brain activity for a video
df = model.get_events_dataframe(video_path="some_video.mp4")
preds, segments = model.predict(events=df)

# Visualize the first timepoint
brain = PlotBrain(mesh="fsaverage5", inflate="half")
fig, axes = plt.subplots(1, 4, figsize=(16, 4))
brain.plot_surf(preds[0], axes=axes, views=["left", "right", "medial_left", "medial_right"], cmap="hot")
plt.savefig("brain_activation.png", dpi=300, bbox_inches="tight")
```

---

## Notes

- The **interactive web demo** at aidemos.atmeta.com is NOT open source — only the Python model + visualization code is.
- Predictions live on the **fsaverage5** cortical mesh (~20k vertices per hemisphere).
- Predictions are offset by **5 seconds** in the past to compensate for hemodynamic lag.
- The model supports **zero-shot** prediction on unseen subjects.
- HuggingFace authentication is needed for training (LLaMA 3.2 access) but NOT for inference with the pretrained model.

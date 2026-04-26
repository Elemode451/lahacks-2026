# Seratone

**Music discovery through predicted brain-response similarity.**

Seratone helps listeners find songs that *feel the same* by comparing music in predicted cortical-response space instead of relying on genre, artist, or listening history.

Users upload a small group of songs that share a similar vibe. Seratone uses TRIBE v2, a brain-encoding model, to generate a predicted cortical-response fingerprint for each song. It then measures how coherent that group is and recommends new songs with similar predicted response patterns.

Seratone also includes **Creator Mode**, where artists can upload their own music, visualize its predicted cortical-response profile, and compare it against songs in our database.

## What It Does

### Listener Mode

- Upload 3–6 songs that feel emotionally or sonically similar (spotify playlist or youtube for now)
- Generate a predicted cortical-response fingerprint for each song. Render in 3D using 3D mesh brain similar to Tribe2 visualization.
- Find recommendations with similar predicted brain-response patterns -- reccomendations based on vibes rather than algorithmic trends
- Compare your music taste profile with friends. 

### Creator Mode

- Upload an original track.
- View a 3D brain visualization of the model-predicted cortical response.
- See region-level response scores.
- Compare the track against songs in our database // songs that have been previously uploaded
- Discover which existing songs are closest in predicted response space.

## Why Seratone

Most recommendation systems use metadata:

- genre
- artist
- listening history
- collaborative filtering
- popularity

But people often like songs for reasons they cannot explain. Two songs can come from totally different artists, genres, languages, or eras and still hit the same emotional space.

Seratone explores a different question:

> What if we recommended music by predicted brain-response similarity?
> How can artists use a cortical response to motivate production choices?

## Tech Stack

### Frontend

- React / Next.js
- Tailwind CSS
- Three.js / React Three Fiber
- 3D brain visualization
- Shareable sound profile cards

### Backend

- FastAPI
- Python
- NumPy / scikit-learn
- TRIBE v2 inference worker
- Cosine similarity search to compare the scores outputted by tribe across a whole song
- Optional Supabase/PostgreSQL storage for precomputed results!

### Model

- TRIBE v2
- Audio-only inference
- Predicted cortical-response fingerprints
- Region-level aggregation for visualization

## Core Pipeline

```txt
audio file
→ TRIBE v2 predicted cortical response
→ fingerprint vector
→ region scores
→ similarity search
→ recommendations / creator comparison

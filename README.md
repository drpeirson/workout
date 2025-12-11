# BOLT Workout Tracker - Release Summary

**BOLT** is a static-first, Progressive Web App (PWA) designed for tracking strength training programs with a focus on performance, offline capability, and data ownership.

## Key Features

### 💪 Core Workout Tracking
* **Multi-Program Architecture:** Comes pre-loaded with specialized strength plans including "Hypertrophy," "Starting Strongman," and "Static Monster".
* **Smart Session Navigation:** Browse workouts by Program, Week, and Session.
* **Intelligent Logging:**
    * **Smart Rep Parsing:** Automatically handles complex targets like "8, 5, 3" and pre-fills the correct target for each set.
    * **Detailed Tracking:** Log Weight (kg), Reps, and RPE/Notes for every set.
    * **Progress Tracking:** Workouts are marked as "Logged" instantly as you enter data.
* **Custom Exercises:**
    * Add your own exercises to any session on the fly.
    * Custom exercises persist locally and sync to the cloud.
    * "Remove" option for custom exercises with safety confirmation.

### ⏱️ Performance Tools
* **Drift-Proof Rest Timer:** A built-in timer that uses delta-time calculation to remain accurate even when the browser throttles background tabs. Includes presets (60s, 90s, 120s, 180s) and custom duration support.
* **"Fun Fact" Summaries:** Gamifies workout volume by comparing total weight lifted to IT equipment (e.g., "You lifted 1,200kg—equivalent to 150 Desktop PCs").

### 📊 Analytics & Data
* **Plan Stats Dashboard:**
    * **Total Volume:** Calculated across all logs.
    * **Session Consistency:** Tracks number of logged sessions vs. total available.
    * **Volume Chart:** Visual bar chart showing volume trends by session.
    * **Top Exercises:** Leaderboard of your most-lifted movements.
* **Data Portability:** Full support for exporting and importing logs via JSON or CSV formats.

### ☁️ Connectivity & Storage
* **Local-First Architecture:** Uses **IndexedDB** (via `idb-keyval`) for primary storage. This is asynchronous, preventing the UI from freezing or crashing even with large datasets.
* **Cloud Sync (Optional):** Integrates with **Supabase** to back up logs when online. Sync logic merges local offline changes with the cloud database upon authentication.
* **Offline Capability:**
    * A **Service Worker** (`sw.js`) caches the app shell, libraries, and JSON data files.
    * Uses a `stale-while-revalidate` caching strategy to serve content instantly while updating in the background.
* **Debounced Saving:** Saves data automatically in the background 500ms after you stop typing to prevent UI freezing.

### 📱 User Experience (PWA)
* **Installable:** Progressive Web App (PWA) manifest allows installation to home screen on iOS and Android.
* **App-Like Feel:**
    * **No Refreshing:** Live UI updates (e.g., "Logged" badges appear instantly).
    * **Mobile Optimizations:** Large tap targets, mobile-friendly drawer navigation, and prevented double-tap zooming.
* **Update Notification:** Automatically detects new versions and prompts the user to reload with a single tap.

## Inner Workings & Architecture

* **Database Layer:** Moves away from synchronous `localStorage` to asynchronous `IndexedDB`, eliminating main-thread blocking during load and save operations.
* **Event Delegation:** Uses efficient event listeners bound to parent containers rather than individual elements, reducing memory usage and preventing "double-fire" bugs.
* **Security:** Implements logical sign-out that wipes local data to protect privacy on shared devices.

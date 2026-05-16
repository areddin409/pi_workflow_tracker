# PI Workflow Tracker

A local case management tool for tracking PI (personal injury) cases — tasks, contacts, deadlines, and phase advancement.

---

## What You Need First

You need **Node.js** installed on your computer. It only needs to be installed once.

1. Go to [nodejs.org](https://nodejs.org)
2. Click the big green **LTS** button to download
3. Run the installer and click through all the defaults
4. When it's done, open a new terminal window and type `node --version` — you should see a version number (like `v20.x.x`)

---

## Installation

Do this once after copying the project folder to your computer.

Open a terminal in the `pi_workflow_tracker` folder, then run these commands one at a time:

```
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

Wait for each one to finish before running the next. You'll see a lot of text scroll by — that's normal.

---

## Starting the App

Every time you want to use the app, open a terminal in the `pi_workflow_tracker` folder and run:

```
npm run dev
```

Wait about 10 seconds, then open your web browser and go to:

**[http://localhost:3000](http://localhost:3000)**

The app will be there. Keep the terminal window open while you're using it — closing it stops the app.

---

## Stopping the App

Click on the terminal window and press `Ctrl + C` (hold Control, then press C). It will ask to confirm — press `Y` and Enter.

---

## Your Data

All data is saved automatically in a file called `pi_tracker.db` inside the `pi_workflow_tracker` folder. You don't need to do anything to save — it saves as you work.

To back up your data, just copy that `pi_tracker.db` file somewhere safe.

---

## Troubleshooting

**The app won't start / "command not found"**
- Make sure Node.js is installed (see "What You Need First" above)
- Make sure you ran all four `npm install` commands

**"Port already in use" error**
- The app is probably already running in another terminal window
- Just go to [http://localhost:3000](http://localhost:3000) in your browser

**The page won't load**
- Make sure the terminal is still open and running (don't close it)
- Try [http://localhost:3000](http://localhost:3000) again after waiting a few more seconds

# YouTube Smart Remote

Een moderne YouTube "Smart TV" ervaring die je bedient vanaf je telefoon. Transformeer je PC-scherm naar een YouTube-ontvanger en gebruik je smartphone als geavanceerde afstandsbediening.

# Trello 

https://trello.com/b/3rsKRH6a/remotecontroller 


## 🚀 Snel Starten

1. **Installatie**:
   ```bash
   npm install
   ```

2. **API Key**:
   Open `server.js` en vul je [YouTube Data API v3 Key](https://console.cloud.google.com/apis/library/youtube.googleapis.com) in bij `YOUTUBE_API_KEY`.

3. **Server Starten**:
   ```bash
   node server.js
   ```

## 📱 Gebruik

1. **Het Scherm (PC/Laptop)**:
   Open [http://localhost:3000/screen.html](http://localhost:3000/screen.html) op het grote scherm. Je ziet nu een grid met populaire video's.

2. **De Afstandsbediening (Telefoon)**:
   Open [http://10.16.33.203:3000](http://10.16.33.203:3000) (gebruik je eigen lokale IP-adres) op je telefoon.

## 🛠 Features

- **Home Grid**: Navigeer door populaire video's op het grote scherm.
- **D-Pad Navigatie**: Blader soepel door video's met de pijltjes op je telefoon.
- **Smart Controls**: 
  - `Home`: Keer direct terug naar het video-overzicht.
  - `-10s / +10s`: Snel spoelen.
  - `Vorige / Volgende`: Wissel van video in de lijst.
- **Zoekfunctie**: Zoek live op YouTube vanaf je telefoon en speel resultaten direct af op het scherm.

## 📄 Licentie
Dit project is gemaakt voor leerdoeleinden.
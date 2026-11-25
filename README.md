# Geräteenergie mit Durchschnitt

Zeigt den heutigen Verbrauch jedes Geräts aus den Energie-Einstellungen („Einzelne Geräte“) als
waagrechten Balken. Ein senkrechter Strich markiert, wie viel das Gerät in den letzten Tagen im Schnitt
**bis zur gleichen Uhrzeit** verbraucht hat – was heute darüber liegt, ist rot. Die blasse Fläche reicht
bis zum Durchschnitt eines ganzen Tages. So fällt sofort auf, welches Gerät heute ungewöhnlich viel
braucht.

*English: Today's consumption per device from the energy settings as horizontal bars, compared with the
average of the last days up to the same time of day; the part above average is red. German user
interface.*

## Installation

1. **Einstellungen → Marketplace → Über Link hinzufügen** und
   `https://github.com/bryce2071/geraeteenergie-card` eintragen (Typ *Dashboard*), dann
   **Geräteenergie mit Durchschnitt** herunterladen. Die Ressource trägt der Marketplace selbst ein.
2. Browser bzw. App einmal neu laden. Danach steht die Karte in der Kartenauswahl.

Voraussetzung: Die Geräte sind im Energie-Dashboard unter **Einzelne Geräte** eingetragen – von dort
nimmt die Karte ihre Liste, Namen und Zähler.

## Beispiel

```yaml
type: custom:geraeteenergie-card
title: Geräteenergie
days: 30
day_options: [7, 10, 30]
compare: time
```

## Optionen

Alle außer `max_devices` und `decimals` auch im Bearbeiten-Dialog.

| Feld | Bedeutung |
|---|---|
| `title` | optional, Überschrift (Standard „Geräteenergie“) |
| `days` | optional, Standard-Zeitraum für den Durchschnitt, 1–90 Tage (Standard 30) |
| `day_options` | optional, Zeiträume im Umschalter oben rechts (Standard `[7, 10, 30]`); `[]` blendet ihn aus. Die Auswahl merkt sich der Browser. |
| `compare` | optional, `time` = Ø bis zur gleichen Uhrzeit (Standard), `day` = Ø ganzer Tage |
| `scale` | optional, `shared` = gemeinsame kWh-Achse (Standard), `device` = jeder Balken auf eigener Skala |
| `hide_zero` | optional, `true` = Geräte ohne Verbrauch heute und ohne Durchschnitt ausblenden |
| `max_devices` | optional, höchstens so viele Geräte zeigen |
| `decimals` | optional, feste Nachkommastellen 0–3 (sonst automatisch) |

## So wird gerechnet

- Heute: volle Stunden aus der Langzeitstatistik plus die laufende Stunde aus der 5-Minuten-Statistik.
- Durchschnitt: Stundenwerte der letzten N vollen Tage, je Tag bis zur gleichen Uhrzeit wie heute (die
  angebrochene Stunde anteilig). Tage ohne Daten zählen nicht mit („nur x Tage mit Daten“).
- Die Karte lädt kurz nach jedem 5-Minuten-Raster neu. Ein Tipp auf ein Gerät öffnet seinen Verlauf.

## Hinweise

- Wer die Datei vorher von Hand eingebunden hatte (`/local/geraeteenergie-card.js`), entfernt diese
  Ressource (**Einstellungen → Dashboards → ⋮ → Ressourcen**), sonst lädt der Browser die ältere Fassung.

## Lizenz

MIT

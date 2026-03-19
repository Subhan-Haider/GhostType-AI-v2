# GhostType AI - Web Store Submission Details

> *This document contains the professional justifications and privacy disclosures required for the Chrome Web Store and Microsoft Edge Add-ons Store.*

---

## 🎯 Single Purpose Description
"GhostType AI is an advanced productivity tool for automated text entry and neural typing simulation. It helps users streamline data entry and restore distorted/squashed text through an integrated AI restoration engine."

---

## 🦾 Permission Justifications

| Permission | Justification |
| :--- | :--- |
| **`scripting`** | Required to inject the `typingEngine` function into the active tab to programmatically simulate keystrokes and handle text input. |
| **`activeTab`** | Required to safely access the current page for text collection and typing ONLY when the user explicitly triggers the extension. |
| **`storage`** | Essential for persisting user settings (WPM, Accuracy, Loops) and securely storing API keys for the AI engine. |
| **`Host Permission`** | Necessary to securely communicate with AI providers (OpenRouter, HuggingFace, TextSynth) via the `fetch` API for text restoration. |

---

## 🧱 Remote Code Declaration
**Selection:** No, I am not using Remote code.

**Justification:**
"All JavaScript logic for the GhostType Neural Engine is included within the extension package. External communication is restricted to authorized AI APIs (OpenRouter, HuggingFace) via standard, authenticated `fetch` requests."

---

## 📊 User Data Usage & Disclosures

### Data Collected:
1.  **Personal Communications**: Users may paste text (such as emails or messages) into the application to use the AI Restoration feature.
2.  **Website Content**: The "Collect" tool reads text from the active webpage to prepare it for automated entry.
3.  **User Activity**: The extension programmatically generates keystrokes to simulate natural typing.

### Data Usage Justification:
"All user data and website content are processed locally for the sole purpose of text entry automation and AI-driven restoration. No data is stored or transmitted to external servers, except for the selected AI providers explicitly configured by the user."

### Certifications:
- [x] I do not sell or transfer user data to third parties.
- [x] I do not use or transfer user data for purposes unrelated to the item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness.

---

## 📜 Privacy Policy
**URL:** `https://github.com/Subhan-Haider/GhostType-AI-v2#privacy-policy`

---
*Prepared for GhostType AI v4.2 Stable Release.*

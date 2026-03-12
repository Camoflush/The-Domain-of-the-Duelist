import pytesseract
from PIL import Image
import os

# === TESSERACT-PFAD EINTRAGEN (DEIN PFAD) ===
pytesseract.pytesseract.tesseract_cmd = r"C:\Users\fabia\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"

# Pfad zu deinen Kartenbildern
IMAGE_FOLDER = "./cards/Legendoftheduelist/"

# Ausgabe-Datei
OUTPUT_FILE = "kartenTexte.txt"

with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
    for file in os.listdir(IMAGE_FOLDER):
        if file.lower().endswith((".png", ".jpg", ".jpeg")):
            image_path = os.path.join(IMAGE_FOLDER, file)

            print(f"Lese Bild: {image_path}")   # ECHO hinzugefügt

            # OCR
            try:
                text = pytesseract.image_to_string(Image.open(image_path))
                out.write(f"----- {file} -----\n")
                out.write(text)
                out.write("\n\n")
                print(f" -> OK ({len(text.strip())} Zeichen)")  # ECHO
            except Exception as e:
                print(f" -> FEHLER BEI {file}: {e}")            # ECHO
                out.write(f"----- {file} -----\n[FEHLER] {e}\n\n")

print("FERTIG – Alles gespeichert in kartenTexte.txt")
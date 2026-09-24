"""
Extracts HeFRA's register of licensed health facilities from its published PDF
into the JSON the admin organisation review reads.

    pip install pypdf          (a one-off tool for this script; NOT a project dependency)
    python scripts/extract-hefra.py path/to/FACILITIES-WITH-VALID-LICENCES.pdf

Writes api/src/server/data/hefra-facilities.json. Run it again whenever HeFRA
publishes a newer list, and commit the JSON; the PDF itself stays out of git.

HOW THE PDF IS READ. Text extraction wraps long cells onto new lines, so the
columns cannot be recovered from line breaks. Every row does end the same way,
though: an ownership word and an expiry date. The whole document is flattened
to one line and split on that ending, and each row is checked against the
sequence number it should carry; a gap would mean a row was merged or lost,
and the script refuses to write rather than publish a list with holes in it.

Inside a row, the facility's NAME, TYPE, REGION and LOCATION run together.
The region is found from the sixteen region names, choosing the occurrence
that has a facility type directly in front of it (a name like "Central Clinic"
or a district like "Central Tongu" contains a region word too). Location is
the district and town together, because the PDF gives no reliable boundary
between them and the admin only needs to read it.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

from pypdf import PdfReader

OWNERSHIP = ["PRIVATE", "PUBLIC", "CHAG", "GOVERNMENT", "GOVERNEMENT", "FAITH-BASED", "QUASI"]
OWNERSHIP_LABEL = {"GOVERNEMENT": "GOVERNMENT"}

REGIONS = {
    "GREATER ACCRA": "Greater Accra",
    "WESTERN NORTH": "Western North",
    "UPPER EAST": "Upper East",
    "UPPER WEST": "Upper West",
    "NORTH EAST": "North East",
    "BONO EAST": "Bono East",
    "BRONG AHAFO": "Bono",
    "AHAFO": "Ahafo",
    "ASHANTI": "Ashanti",
    "BONO": "Bono",
    "CENTRAL": "Central",
    "EASTERN": "Eastern",
    "NORTHERN": "Northern",
    "OTI": "Oti",
    "SAVANNAH": "Savannah",
    "VOLTA": "Volta",
    "WESTERN": "Western",
    "WESTREN": "Western",
    "EASTREN": "Eastern",
}

# Longest first, so "PRIMARY HOSPITAL" wins over "HOSPITAL".
TYPES = sorted(
    [
        "PRIMARY HOSPITAL", "SECONDARY HOSPITAL", "REGIONAL HOSPITAL", "TEACHING HOSPITAL",
        "PSYCHIATRIC HOSPITAL", "SPECIALIST HOSPITAL", "HOSPITAL",
        "HEALTH CENTRE- WOUND CARE", "HEALTH CENTRE", "HEALTH CENTER",
        "PRIMARY DIAGNOSTIC CENTRE", "DIAGNOSTIC CENTRE", "BASIC IMAGING CENTRE", "IMAGING CENTRE",
        "MATERNITY HOME", "OPTOMETRY CENTRE", "DENTAL CLINIC", "EYE CLINIC",
        "MULTI-SPECIALTY CLINIC", "SPECIALIST CLINIC", "CLINIC", "POLYCLINIC",
        "PRIMARY MEDICAL LABORATORY", "MEDICAL LABORATORY", "LABORATORY",
        "CHPS COMPOUND", "CHPS", "PHYSIOTHERAPY CENTRE", "REHABILITATION CENTRE",
        "FERTILITY CENTRE", "DIALYSIS CENTRE", "CENTRE",
    ],
    key=len,
    reverse=True,
)

REGION_RX = re.compile(r"\b(" + "|".join(sorted(REGIONS, key=len, reverse=True)) + r")(?: REGION)?\b")
ROW_RX = re.compile(
    r"\s*(\d{1,4}) (.*?) (" + "|".join(OWNERSHIP) + r") (\d{1,2})/(\d{1,2})/(\d{2,4})"
)


def split_body(body: str):
    """Returns (name, type, region, location) for one row's middle section."""
    for match in REGION_RX.finditer(body):
        before = body[: match.start()].rstrip()
        for facility_type in TYPES:
            if before.endswith(" " + facility_type) or before == facility_type:
                name = before[: len(before) - len(facility_type)].strip(" -,")
                if name:
                    location = body[match.end():].strip()
                    return name, facility_type, REGIONS[match.group(1)], location
    # No typed region found: keep the whole row as the name, so it is still
    # searchable, and say nothing we cannot back up.
    return body.strip(), None, None, None


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/extract-hefra.py <path to the HeFRA PDF>")

    reader = PdfReader(sys.argv[1])
    text = re.sub(r"\s+", " ", " ".join(page.extract_text() for page in reader.pages))
    text = text[text.index("EXPIRY") + len("EXPIRY"):]

    facilities = []
    for index, match in enumerate(ROW_RX.finditer(text)):
        number = int(match.group(1))
        if number != index + 1:
            sys.exit(f"Row {index + 1} came out as {number}: the PDF did not split cleanly. Nothing written.")
        name, facility_type, region, location = split_body(match.group(2))
        month, day, year = int(match.group(4)), int(match.group(5)), int(match.group(6))
        if year < 100:
            year += 2000
        # The list is month/day/year, but a handful of rows were typed
        # day/month/year. A "month" above 12 can only be that, so it is
        # swapped; a date that fits both ways is read the way the rest are.
        if month > 12 and day <= 12:
            month, day = day, month
        facilities.append(
            {
                "name": name,
                "type": facility_type,
                "region": region,
                "location": location,
                "ownership": OWNERSHIP_LABEL.get(match.group(3), match.group(3)),
                "expires": date(year, month, day).isoformat(),
            }
        )

    untyped = sum(1 for f in facilities if f["type"] is None)
    out = Path(__file__).resolve().parent.parent / "api" / "src" / "server" / "data" / "hefra-facilities.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "HeFRA, Facilities with valid licences (published PDF)",
        "extracted": date.today().isoformat(),
        "count": len(facilities),
        "facilities": facilities,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(facilities)} facilities written to {out}; {untyped} without a recognised type/region.")


if __name__ == "__main__":
    main()

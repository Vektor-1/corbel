# Floor-plan test corpus

These fixtures are for development and evaluation of Corbel Trace. They are not production training data.

| Local file | Source | Creator/source | License | Purpose |
|---|---|---|---|---|
| `clean-modern-public-domain.jpg` | [Wikimedia Commons: Sample Floorplan](https://commons.wikimedia.org/wiki/File:Sample_Floorplan.jpg) | Boereck | Public domain | Clean modern residential plan |
| `clean-modern-degraded-derived.jpg` | Derived locally from `clean-modern-public-domain.jpg` | Corbel test transformation | Public domain derivative | Rotation, compression and low-contrast robustness |
| `clean-modern-public-domain.pdf` | Derived locally from `clean-modern-public-domain.jpg` | Corbel test transformation | Public domain derivative | PDF ingestion and page rasterization |
| `historic-home-public-domain.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Floor_plan_of_first_floor_of_home_LCCN2006682529.jpg) | Library of Congress | Public domain | Historic scanned residential drawing |
| `historic-library-public-domain.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Floor_plan_for_a_small_public_library_LCCN2007682638.jpg) | Library of Congress | Public domain | Large scanned institutional drawing |
| `complex-historic-public-domain.jpg` | [Wikimedia Commons: Fontainebleau floor plan](https://commons.wikimedia.org/wiki/File:Fontainebleau_floor_plan.jpg) | François d'Orbay | Public domain mark | Complex historic geometry |
| `kitchen-remodel-cc-by-sa.svg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kitchen_Remodel_Floor_Plan_After_1.svg) | Stilfehler | CC BY-SA 4.0 | Vector-source test |
| `kitchen-remodel-cc-by-sa.png` | Rasterized locally from the SVG above | Stilfehler / Corbel test conversion | CC BY-SA 4.0 | Rasterized vector plan |

The CC BY-SA fixture and derivative must retain attribution and the same license if redistributed. CubiCasa5K was reviewed but not copied into this corpus because its dataset license is CC BY-NC 4.0.

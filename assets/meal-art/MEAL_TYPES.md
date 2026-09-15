# Shared meal-type illustrations

Meal cards and recipe heroes retain approved recipe photos and the 39 registered
serving illustrations. Other bundled recipes use shared category defaults:
2,160 template variations use their explicit base (rice, couscous, quinoa,
pasta, or rice noodles); 79 other recipes have reviewed assignments in
`src/data/recipe-meal-types.json`. Unknown IDs keep the neutral place setting.
The mappings are presentation data and do not change recipe ingredients,
allergens, equipment, nutrition, ranking, or meal planning.

`meal-types.png` is original generated artwork made on September 11, 2026
with the built-in image-generation tool. It is one square 3 by 3 atlas,
visually reviewed in row-major order: soup, salad, pancakes; chicken, smoothie,
potatoes; plantain, dip, fruit. Other categories reuse tiles from `servings.png`.
These are generic serving examples, not photographs of tested recipes.
All files are bundled offline. There is no runtime image service or API fee.

The 35 reviewed Commons ingredient photographs remain available for pantry
thumbnails and retain their attribution on the Image credits screen.

## Source research

[Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en)
is a source for reusable meal photographs. Each file's license and attribution
must be checked individually; a category label alone is not a recipe match.

[Food-101](https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/) contains
101,000 images across 101 food categories. Its landing page does not establish
commercial redistribution rights for the individual photographs, so no images
from that dataset are shipped here. Public availability is not treated as
permission to republish a dataset's photographs in the app.

## Generation prompt

Create one square 3 by 3 sprite atlas for a cooking app's DEFAULT MEAL TYPE
ILLUSTRATIONS. Exactly nine equally sized square cells, perfectly aligned 3
columns and 3 rows, no margins or gutters, no lines, no text, no logos. Each
cell has the same warm pale cream background, centered white ceramic dish
with plenty of cream space at edges, top down overhead view, soft studio
shadows, appetizing realistic editorial food illustration. The cells are
independent serving illustrations, each whole dish entirely within its cell.
Row 1 left to right: bowl of golden vegetable soup; bowl of fresh chopped
green salad with cucumber and tomato; plate of three small golden pancakes.
Row 2: plate of cooked roasted chicken pieces; clear glass of golden mango
smoothie seen from above; bowl of creamy mashed potatoes. Row 3: plate of
golden cooked plantain slices; small bowl of plain creamy yogurt dip with a
few herbs; bowl of colorful cut fresh fruit. All objects centered, no forks,
no hands, no decorative extras. Photorealistic rendered illustration,
visually consistent across all nine cells. Output a single square atlas image.

"""Materialize complete DecisionEats meal variations from explicit cooking components.

This is authored content, not an imported corpus or an AI service. Every allowed
combination has a full preparation, measured ingredients and hard constraints.
Counts must be reported separately from independently sourced recipes.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from itertools import product
from pathlib import Path

from tools.catalog.models import SourceRecipe

SOURCE_URL = "https://github.com/ReedDeL/DecisionEats/blob/master/tools/catalog/meal_templates.py"


@dataclass(frozen=True)
class Component:
    key: str
    label: str
    ingredients: tuple[tuple[str, str], ...]
    steps: str


PROTEINS = (
    Component(
        "chicken",
        "Chicken",
        (("chicken_breast", "350 g"),),
        "Cut the boneless chicken breast into 2 cm pieces on a separate board. "
        "Heat half the olive oil in a large skillet over medium-high heat. Cook "
        "the chicken for 8-12 minutes, stirring, until every piece reaches 165 F "
        "(74 C) in the center. Transfer to a clean plate; wash hands and utensils.",
    ),
    Component(
        "turkey",
        "Turkey",
        (("ground_turkey", "350 g"),),
        "Heat half the olive oil in a large skillet over medium-high heat. "
        "Add the ground turkey, break it into small crumbles and cook for "
        "8-12 minutes, until it reaches 165 F (74 C). Transfer to a clean plate.",
    ),
    Component(
        "tofu",
        "Tofu",
        (("tofu", "350 g"),),
        "Drain plain firm tofu, pat it dry and cut into 2 cm cubes. "
        "Heat half the olive oil in a large skillet over medium-high heat. "
        "Cook the tofu for 8-10 minutes, turning gently, until golden. "
        "Transfer to a clean plate.",
    ),
    Component(
        "chickpea",
        "Chickpea",
        (("canned_chickpeas", "360 g drained"),),
        "Drain and rinse the canned chickpeas. These must be canned, ready-to-eat "
        "beans, not dried beans. Heat half the olive oil in a large skillet. "
        "Stir the chickpeas over medium heat for 5 minutes, then transfer to a plate.",
    ),
    Component(
        "white-bean",
        "White Bean",
        (("canned_cannellini_beans", "360 g drained"),),
        "Drain and rinse the canned cannellini beans. These must be canned, "
        "ready-to-eat beans, not dried beans. Heat half the olive oil in a large "
        "skillet. Stir the beans over medium heat for 5 minutes, then transfer to a plate.",
    ),
    Component(
        "black-bean",
        "Black Bean",
        (("canned_black_beans", "360 g drained"),),
        "Drain and rinse the canned black beans. These must be canned, ready-to-eat "
        "beans, not dried beans. Heat half the olive oil in a large skillet. "
        "Stir the beans over medium heat for 5 minutes, then transfer to a plate.",
    ),
)

# Cutting size and a covered steaming stage make the vegetable cook time
# explicit; leafy ingredients enter after firm vegetables.
VEGETABLES = (
    Component(
        "broccoli-carrot",
        "Broccoli and Carrot",
        (("broccoli", "150 g"), ("carrots", "150 g")),
        "Cut broccoli into small florets and carrots into thin half-moons.",
    ),
    Component(
        "pepper-onion",
        "Pepper and Onion",
        (("bell_pepper", "180 g"), ("onion", "120 g")),
        "Remove pepper seeds and slice the pepper and onion thinly.",
    ),
    Component(
        "zucchini-mushroom",
        "Zucchini and Mushroom",
        (("zucchini", "150 g"), ("mushrooms", "150 g")),
        "Cut zucchini into thin half-moons and slice the mushrooms.",
    ),
    Component(
        "spinach-tomato",
        "Spinach and Tomato",
        (("spinach", "120 g"), ("tomato", "180 g")),
        "Chop the tomatoes; wash and roughly chop the spinach. "
        "Reserve the spinach for the final 3 minutes of vegetable cooking.",
    ),
    Component(
        "green-bean-carrot",
        "Green Bean and Carrot",
        (("green_beans", "150 g"), ("carrots", "150 g")),
        "Trim green beans and cut into 2 cm pieces. Thinly slice the carrots.",
    ),
    Component(
        "cauliflower-pea",
        "Cauliflower and Pea",
        (("cauliflower", "180 g"), ("frozen_peas", "120 g")),
        "Cut cauliflower into small florets. Keep the frozen peas ready.",
    ),
    Component(
        "cabbage-carrot",
        "Cabbage and Carrot",
        (("cabbage", "180 g"), ("carrots", "120 g")),
        "Shred the cabbage and thinly slice the carrots.",
    ),
    Component(
        "mushroom-pea",
        "Mushroom and Pea",
        (("mushrooms", "180 g"), ("frozen_peas", "120 g")),
        "Slice the mushrooms and keep the frozen peas ready.",
    ),
    Component(
        "kale-tomato",
        "Kale and Tomato",
        (("kale", "120 g"), ("tomato", "180 g")),
        "Remove tough kale stems and finely slice the leaves. Chop the tomatoes.",
    ),
    Component(
        "zucchini-pepper",
        "Zucchini and Pepper",
        (("zucchini", "150 g"), ("bell_pepper", "150 g")),
        "Slice the zucchini thinly. Remove pepper seeds and cut into thin strips.",
    ),
    Component(
        "broccoli-mushroom",
        "Broccoli and Mushroom",
        (("broccoli", "150 g"), ("mushrooms", "150 g")),
        "Cut broccoli into small florets and slice the mushrooms.",
    ),
    Component(
        "corn-pepper",
        "Corn and Pepper",
        (("frozen_corn", "150 g"), ("bell_pepper", "150 g")),
        "Remove pepper seeds and slice thinly. Keep the frozen corn ready.",
    ),
)

FLAVORS = (
    Component(
        "lemon-garlic",
        "Lemon Garlic",
        (("lemon_juice", "2 tbsp"), ("garlic", "2 cloves"), ("dried_oregano", "1 tsp")),
        "Finely chop the garlic. Stir it and the oregano into the tender vegetables "
        "for 1 minute. Stir in the lemon juice and 60 ml water.",
    ),
    Component(
        "tomato-basil",
        "Tomato Basil",
        (("canned_tomatoes", "200 g"), ("garlic", "2 cloves"), ("dried_basil", "1 tsp")),
        "Finely chop the garlic and stir it into the tender vegetables for 1 minute. "
        "Add the canned tomatoes and basil; break up the tomatoes and simmer 5 minutes.",
    ),
    Component(
        "smoky-paprika",
        "Smoky Paprika",
        (
            ("smoked_paprika", "1 tsp"),
            ("cumin", "1 tsp"),
            ("tomato_paste", "2 tbsp"),
            ("lemon_juice", "1 tbsp"),
        ),
        "Stir paprika, cumin and tomato paste into the tender vegetables for 1 minute. "
        "Add the lemon juice and 90 ml water; stir and simmer for 3 minutes.",
    ),
    Component(
        "ginger-soy",
        "Ginger Soy",
        (
            ("ginger", "10 g"),
            ("garlic", "2 cloves"),
            ("soy_sauce", "2 tbsp"),
            ("rice_vinegar", "1 tbsp"),
        ),
        "Peel and finely grate the ginger; finely chop the garlic. Stir both into "
        "the tender vegetables for 1 minute. Add soy sauce, rice vinegar and "
        "60 ml water, then simmer for 2 minutes.",
    ),
    Component(
        "coconut-spice",
        "Coconut Spice",
        (
            ("coconut_milk", "180 ml"),
            ("cumin", "1 tsp"),
            ("turmeric", "0.5 tsp"),
            ("ginger", "10 g"),
            ("lime_juice", "1 tbsp"),
        ),
        "Peel and finely grate the ginger. Stir it, the cumin and turmeric into "
        "the tender vegetables for 1 minute. Add coconut milk and simmer for "
        "4 minutes, then stir in the lime juice.",
    ),
    Component(
        "peanut-lime",
        "Peanut Lime",
        (
            ("peanut_butter", "2 tbsp"),
            ("lime_juice", "2 tbsp"),
            ("soy_sauce", "1 tbsp"),
            ("ginger", "10 g"),
        ),
        "Peel and finely grate the ginger. Whisk it with smooth peanut butter, "
        "lime juice, soy sauce and 90 ml warm water. Pour into the tender "
        "vegetables and simmer gently for 3 minutes, stirring.",
    ),
)

BASES = (
    Component(
        "rice",
        "Rice Bowl",
        (("rice", "160 g"),),
        "Rinse the dry long-grain white rice. Bring it and 320 ml water to a boil "
        "in a saucepan. Cover, reduce to low and cook for 15-20 minutes until "
        "tender and the water is absorbed. Rest covered for 5 minutes; fluff.",
    ),
    Component(
        "quinoa",
        "Quinoa Bowl",
        (("quinoa", "160 g"),),
        "Rinse the dry quinoa well. Bring it and 360 ml water to a boil in a "
        "saucepan. Cover and simmer gently for 15-20 minutes until tender. "
        "Rest off the heat for 5 minutes and fluff.",
    ),
    Component(
        "couscous",
        "Couscous Bowl",
        (("couscous", "160 g"),),
        "Bring 200 ml water to a boil in a saucepan. Remove from the heat, "
        "stir in the dry instant couscous, cover and stand for 5 minutes. "
        "Fluff; use standard instant couscous, not pearl couscous.",
    ),
    Component(
        "pasta",
        "Pasta",
        (("pasta", "160 g"),),
        "Bring 1.5 liters water to a boil in a saucepan. Add dry wheat pasta "
        "and boil for 10-12 minutes, or the packet time, until tender. Drain.",
    ),
    Component(
        "rice-noodles",
        "Rice Noodles",
        (("rice_noodles", "160 g"),),
        "Bring 1.5 liters water to a boil in a saucepan. Add plain dry rice "
        "noodles and cook for 3-8 minutes, following their packet time, until "
        "tender. Drain and rinse briefly with warm water to prevent sticking.",
    ),
)


def generate_recipes() -> list[SourceRecipe]:
    """Return 2,160 distinct, fully specified combinations; no random generation."""
    rows: list[SourceRecipe] = []
    for protein, vegetables, flavor, base in product(PROTEINS, VEGETABLES, FLAVORS, BASES):
        identity = f"template:{protein.key}:{vegetables.key}:{flavor.key}:{base.key}"
        ingredients = [
            *protein.ingredients,
            *vegetables.ingredients,
            *flavor.ingredients,
            *base.ingredients,
            ("olive_oil", "1 tbsp"),
        ]
        if len({name for name, _ in ingredients}) != len(ingredients):
            raise ValueError(f"duplicate ingredient in {identity}")
        diet = ["dairy_free"]
        if protein.key not in {"chicken", "turkey"}:
            diet += ["vegan", "vegetarian"]
        # Generic packaged pasta/noodles/sauces are not certified gluten-free.
        # No halal, kosher or clinical nutrition claims are inferred.
        instructions = (
            "Makes 2 servings. Use plain, unseasoned protein and vegetables. "
            "Wash produce and measure the ingredients. "
            + vegetables.steps
            + "\n\n"
            + base.steps
            + " Cook the skillet mixture while the base cooks.\n\n"
            + protein.steps
            + "\n\n"
            "Add the remaining olive oil to the skillet. Add the prepared vegetables "
            "(holding back any spinach), stir for 2 minutes, then add 60 ml water. "
            "Cover and cook over medium heat for 8-12 minutes, stirring occasionally, "
            "until the firmest vegetables are tender. Add any reserved spinach for "
            "the final 3 minutes. Uncover and let excess water evaporate.\n\n"
            + flavor.steps
            + "\n\n"
            "Return the cooked protein to the skillet. Stir gently and heat for "
            "3-5 minutes until piping hot throughout. If too thick, add water a "
            "tablespoon at a time. Divide the cooked base and skillet mixture "
            "between two bowls and serve promptly. Refrigerate leftovers within "
            "2 hours and reheat until piping hot throughout."
        )
        rows.append(
            SourceRecipe.model_validate(
                {
                    "sourceRecipeId": identity,
                    "title": f"{flavor.label} {protein.label} {base.label} with {vegetables.label}",
                    "sourceUrl": SOURCE_URL,
                    "attributionText": "DecisionEats original meal-template variation. "
                    "Materialized from explicit ingredients and cooking components; "
                    "not an independently sourced or individually kitchen-tested recipe.",
                    "instructions": instructions,
                    "ingredients": [
                        {"name": name, "measure": measure} for name, measure in ingredients
                    ],
                    "equipment": ["stove"],
                    "totalTimeMinutes": 45,
                    "baseServings": 2,
                    "mealSlots": ["lunch", "dinner"],
                    "allergenStatus": "verified",
                    "dietaryStatus": "verified",
                    "dietaryTags": sorted(diet),
                }
            )
        )
    return sorted(rows, key=lambda recipe: recipe.source_recipe_id)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output exists; choose a new source version")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(
            json.dumps(row.model_dump(by_alias=True), sort_keys=True, ensure_ascii=False) + "\n"
            for row in generate_recipes()
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

function addCardClarity() {
  if (typeof products === "undefined") return;

  const cards = document.querySelectorAll(".product-card");
  cards.forEach((card, index) => {
    const product = products[index];
    if (!product || card.querySelector(".card-best")) return;

    const bestFor = document.createElement("div");
    bestFor.className = "card-best";
    bestFor.innerHTML = `<b>Best for:</b> ${product.best}`;

    const action = card.querySelector("em");
    if (action) {
      card.insertBefore(bestFor, action);
    } else {
      card.appendChild(bestFor);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addCardClarity);
} else {
  addCardClarity();
}

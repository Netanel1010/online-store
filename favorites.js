document.addEventListener("DOMContentLoaded", () => {
  const favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

  const container = document.querySelector("#favorites-page"); // ודא שזה קיים ב-HTML שלך

  // כותרת
  const titleDiv = document.createElement("div");
  titleDiv.classList.add("favorite-name");
  const h1 = document.createElement("h1");
  h1.textContent = "מועדפים";
  titleDiv.appendChild(h1);
  container.appendChild(titleDiv);

  // עטיפת טבלה
  const favContainer = document.createElement("div");
  favContainer.classList.add("favorite-container");

  const tableWrapper = document.createElement("div");
  tableWrapper.classList.add("favorite-table");

  const table = document.createElement("table");

  // כותרת טבלה
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["הסר", "תמונה", "מוצרים", "מחיר", "כמות", "סה\"כ"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // גוף טבלה
  const tbody = document.createElement("tbody");

  favorites.forEach(product => {
    const row = document.createElement("tr");

    // הסרה
    const tdRemove = document.createElement("td");
    const trashIcon = document.createElement("i");
    trashIcon.classList.add("fa-regular", "fa-trash-can");
    trashIcon.style.cursor = "pointer";
    tdRemove.appendChild(trashIcon);
    trashIcon.addEventListener("click", () => {
      const index = favorites.findIndex(p => p.id === product.id);
      if (index !== -1) {
        favorites.splice(index, 1);
        localStorage.setItem("favorites", JSON.stringify(favorites));
        row.remove(); // הסרה מה-HTML
      }
    });
    row.appendChild(tdRemove);

    // תמונה
    const tdImg = document.createElement("td");
    const img = document.createElement("img");
    img.src = product.mainImage;
    tdImg.appendChild(img);
    row.appendChild(tdImg);

    // שם מוצר
    const tdName = document.createElement("td");
    const link = document.createElement('a');
    link.classList.add("title");
    link.href = `product page.html?id=${product.id}`; // קישור לעמוד המוצר
    link.textContent = product.fullName;
    tdName.appendChild(link);
    row.appendChild(tdName);

    // מחיר
    const tdPrice = document.createElement("td");
    tdPrice.classList.add("price");
    tdPrice.textContent = `₪ ${product.priceNew}`;
    row.appendChild(tdPrice);

    // כמות
    const tdCount = document.createElement("td");
    tdCount.classList.add("count");

    const plusBtn = document.createElement("button");
    plusBtn.classList.add("plus");
    plusBtn.textContent = "+";

    const input = document.createElement("input");
    input.type = "text";
    input.value = "1";

    const minusBtn = document.createElement("button");
    minusBtn.classList.add("minus");
    minusBtn.textContent = "-";

    tdCount.appendChild(plusBtn);
    tdCount.appendChild(input);
    tdCount.appendChild(minusBtn);
    row.appendChild(tdCount);

    // סה"כ
    const tdSum = document.createElement("td");
    tdSum.classList.add("sum");
    const updateSum = () => {
      const quantity = parseInt(input.value) || 1;
      tdSum.textContent = `₪ ${product.priceNew * quantity}`;
    };
    updateSum();
    input.addEventListener("input", updateSum);
    plusBtn.addEventListener("click", () => {
      input.value = parseInt(input.value) + 1;
      updateSum();
    });
    minusBtn.addEventListener("click", () => {
      if (parseInt(input.value) > 1) {
        input.value = parseInt(input.value) - 1;
        updateSum();
      }
    });
    row.appendChild(tdSum);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  // כפתורים מתחת לטבלה
  const buttonsDiv = document.createElement("div");
  buttonsDiv.classList.add("common-buttons");

  const updateBtn = document.createElement("button");
  updateBtn.textContent = "עדכן מועדפים";
  updateBtn.addEventListener("click", () => {
    alert("המועדפים עודכנו (עדיין לא עובד) ");
  });

  const cartLink = document.createElement("a");
  cartLink.href = "shopping cart.html";
  const addToCartBtn = document.createElement("button");
  addToCartBtn.textContent = "הוסף לסל";
  cartLink.appendChild(addToCartBtn);

  buttonsDiv.appendChild(updateBtn);
  buttonsDiv.appendChild(cartLink);

  tableWrapper.appendChild(buttonsDiv);
  favContainer.appendChild(tableWrapper);
  container.appendChild(favContainer);
});

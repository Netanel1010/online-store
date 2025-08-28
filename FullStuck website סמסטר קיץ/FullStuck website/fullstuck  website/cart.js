document.addEventListener("DOMContentLoaded", () => {
  const cart = JSON.parse(localStorage.getItem("cart") || "[]");

  const container = document.querySelector("#shopping-cart-page");

  const wrapper = document.createElement("div");
  wrapper.classList.add("shopping-cart-table");

  const table = document.createElement("table");

  // יצירת כותרת הטבלה
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["הסר", "תמונה", "מוצרים", "מחיר", "כמות", "סה\"כ"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // גוף הטבלה
  const tbody = document.createElement("tbody");

  cart.forEach(product => {
    const row = document.createElement("tr");

    // הסרה
    const tdRemove = document.createElement("td");
    const trashIcon = document.createElement("i");
    trashIcon.classList.add("fa-regular", "fa-trash-can");
    trashIcon.style.cursor = "pointer";
    tdRemove.appendChild(trashIcon);
    row.appendChild(tdRemove);

    trashIcon.addEventListener("click", () => {
      const index = cart.findIndex(p => p.id === product.id);
      if (index !== -1) {
        cart.splice(index, 1);
        localStorage.setItem("cart", JSON.stringify(cart));
        row.remove();
      }
    });

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
    link.href = `product page.html?id=${product.id}`;
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
    input.value = product.count || 1;

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
      product.count = quantity;
      localStorage.setItem("cart", JSON.stringify(cart));
    };

    updateSum();

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

    input.addEventListener("input", updateSum);
    row.appendChild(tdSum);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
});

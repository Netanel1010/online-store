const header = document.querySelector("header");
const head = document.querySelector("header .head");

/*חיפוש*/
const search = document.querySelector(".search");
const input = document.createElement("input");
input.type = "text";
input.placeholder = "חפש מוצרים...";
search.appendChild(input);


const cart = document.querySelector(".cart");
/*עכשיו במקום להשתמש בכול הממך לשתי הפריטים הבאים שזה דוקיומנט נשתמש ב - cart*/
/* מועדפים */
const faHeart = cart.querySelectorAll("a")[1]; // לוקח את הקישור השני ב-cart
const favBadge = document.createElement("span");
favBadge.classList.add("badge-1");
favBadge.textContent = Number(0);
faHeart.querySelector("i").appendChild(favBadge);


let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
if (favorites.length > 0) {
  faHeart.classList.add("active");
  favBadge.textContent = favorites.length;
}


/* עגלת קניות */
const faShopping = cart.querySelectorAll("a")[2]; // לוקח את הקישור השלישי ב-cart
const shopBadge = document.createElement("span");
shopBadge.classList.add("badge");
shopBadge.textContent = Number(0);
faShopping.querySelector("i").appendChild(shopBadge);

let cart1 = JSON.parse(localStorage.getItem("cart") || "[]");
if (cart1.length > 0) {
  faShopping.classList.add("active");
  shopBadge.textContent = cart1.length;
}

//מבצעים
fetch('products.json')
  .then(res => res.json())
  .then(data => {
    const saleContainer = document.querySelector(".sale");
    const saleNone = document.querySelector("#saleNone");/*מה שעוטף הכול*/

    if (!saleContainer || !saleNone) {
      console.warn("לא נמצא .sale או #saleNone בדף זה. ייתכן וזה product page.html");
      return;
    }


    const saleProducts = data.filter(product =>
      typeof product.priceOld === "number" && product.priceOld > 0
    );

    if (saleProducts.length === 0) {
      saleNone.style.display = "none";
      return;
    }

    saleProducts.forEach(product => {

      const itemDiv = document.createElement("div");
      itemDiv.classList.add("item");


      const imgLink = document.createElement("a");
      imgLink.href = `product page.html?id=${product.id}`;

      const img = document.createElement("img");
      img.src = product.image;
      img.classList.add("image");
      imgLink.appendChild(img);
      itemDiv.appendChild(imgLink);


      const titleLink = document.createElement("a");
      titleLink.href = `product page.html?id=${product.id}`;

      const labelDiv = document.createElement("div");
      labelDiv.classList.add("lable");

      const title = document.createElement("h2");
      title.classList.add("title");
      title.textContent = product.name;

      const remark = document.createElement("div");
      remark.classList.add("remark");
      remark.textContent = product.id;

      titleLink.appendChild(labelDiv);
      titleLink.appendChild(title);
      titleLink.appendChild(remark);
      itemDiv.appendChild(titleLink);


      const priceLink = document.createElement("a");
      priceLink.href = `product page.html?id=${product.id}`;

      const priceDiv = document.createElement("div");
      priceDiv.classList.add("price");



      const oldPrice = document.createElement("span");
      oldPrice.classList.add("old");
      oldPrice.textContent = "₪" + product.priceOld;
      priceDiv.appendChild(oldPrice);

      const newPrice = document.createElement("span");
      newPrice.classList.add("new");
      newPrice.textContent = "₪" + product.priceNew;
      priceDiv.appendChild(newPrice);

      priceLink.appendChild(priceDiv);
      itemDiv.appendChild(priceLink);


      const brandDiv = document.createElement("div");
      brandDiv.classList.add("brands");

      const brandImg = document.createElement("img");
      brandImg.src = product.brand;
      brandDiv.appendChild(brandImg)
      itemDiv.appendChild(brandDiv);


      const cartDiv = document.createElement("div");
      cartDiv.classList.add("add-to-cart");

      const cartLink = document.createElement("a");
      cartLink.href = "#";

      const cartBtn = document.createElement("button");
      cartBtn.classList.add("cart");
      cartBtn.innerHTML = '<i class="fa fa-shopping-cart"></i>';
      cartLink.appendChild(cartBtn);

      const isInCart = cart1.some(p => p.id === product.id);
      if (isInCart) {
        cartBtn.classList.add("active"); // אם המוצר בעגלה, הוסף את הקלאס active
      }


      //עגלה
      cartLink.addEventListener("click", (event) => {

        event.preventDefault(); // למנוע מעבר לקישור

        let cart = JSON.parse(localStorage.getItem("cart") || "[]");//לוקח את העגלה מה- localStorage

        const index = cart.findIndex(p => p.id === product.id);// מחפש אם המוצר כבר בעגלה לפי בחירת ה-id

        if (index !== -1) {
          cart[index].count += 1; // עדכון כמות
        }
        else {
          const newProduct = { ...product, count: 1 };//אם מוצר לא קיים בעגלה אז נוסיף אותו עם כמות של 1
          cart.push(newProduct); // הוספה
        }

        localStorage.setItem("cart", JSON.stringify(cart));//שומר את  העגלה ב- localStorage

        cartBtn.classList.add("active"); //הוספת קלאס לשינוי צבע 
        shopBadge.textContent = cart.length; //עדכון מספר הפריטים בעגלה
        faShopping.classList.add("active"); //הוספת קלאס לעגלת קניות

      });



      const fastBuyLink = document.createElement("a");
      fastBuyLink.href = "#";

      const fastBuyBtn = document.createElement("button");
      fastBuyBtn.classList.add("fest-buy");
      fastBuyBtn.innerHTML = "קנייה מהירה";
      fastBuyLink.appendChild(fastBuyBtn);

      cartDiv.appendChild(cartLink);
      cartDiv.appendChild(fastBuyLink);
      itemDiv.appendChild(cartDiv);


      saleContainer.appendChild(itemDiv);
    });
    console.log(saleProducts);

    //לבדוק האם הם עובדים
    console.log("saleContainer:", saleContainer);
    console.log("saleProducts:", saleProducts);

  })
  .catch(err => console.error("שגיאה בטעינת המוצרים:", err));




//מומלצים
fetch('products.json')
  .then(res => res.json())
  .then(data => {

    const recommendContainer = document.querySelector('.recommend');
    const recommendNone = document.querySelector('#recommendNone');


    const recommendProducts = data.filter(product => product.Recommend === true);



    if (recommendProducts.length === 0) {
      recommendNone.style.display = "none";
      return;
    }

    recommendProducts.forEach(product => {

      const itemDiv = document.createElement("div");
      itemDiv.classList.add("item");


      const imgLink = document.createElement("a");
      imgLink.href = `product page.html?id=${product.id}`;

      const img = document.createElement("img");
      img.src = product.image;
      img.classList.add("image");
      imgLink.appendChild(img);
      itemDiv.appendChild(imgLink);


      const titleLink = document.createElement("a");
      titleLink.href = `product page.html?id=${product.id}`;

      const labelDiv = document.createElement("div");
      labelDiv.classList.add("lable");

      const title = document.createElement("h2");
      title.classList.add("title");
      title.textContent = product.name;

      const remark = document.createElement("div");
      remark.classList.add("remark");
      remark.textContent = product.id;

      titleLink.appendChild(labelDiv);
      titleLink.appendChild(title);
      titleLink.appendChild(remark);
      itemDiv.appendChild(titleLink);


      const priceLink = document.createElement("a");
      priceLink.href = `product page.html?id=${product.id}`;

      const priceDiv = document.createElement("div");
      priceDiv.classList.add("price");



      if (product.priceOld) {       /*אם יש מחיר נציג אותו*/
        const oldPrice = document.createElement("span");
        oldPrice.classList.add("old");
        oldPrice.textContent = "₪" + product.priceOld;
        priceDiv.appendChild(oldPrice);
      }

      const newPrice = document.createElement("span");
      newPrice.classList.add("new");
      newPrice.textContent = "₪" + product.priceNew;
      priceDiv.appendChild(newPrice);

      priceLink.appendChild(priceDiv);
      itemDiv.appendChild(priceLink);


      const brandDiv = document.createElement("div");
      brandDiv.classList.add("brands");

      const brandImg = document.createElement("img");
      brandImg.src = product.brand;
      brandDiv.appendChild(brandImg)
      itemDiv.appendChild(brandDiv);


      const cartDiv = document.createElement("div");
      cartDiv.classList.add("add-to-cart");

      const cartLink = document.createElement("a");
      cartLink.href = "#";

      const cartBtn = document.createElement("button");
      cartBtn.classList.add("cart");
      cartBtn.innerHTML = '<i class="fa fa-shopping-cart"></i>';
      cartLink.appendChild(cartBtn);

      const isInCart = cart1.some(p => p.id === product.id);
      if (isInCart) {
        cartBtn.classList.add("active"); // אם המוצר בעגלה, הוסף את הקלאס active
      }


      //עגלה
      cartLink.addEventListener("click", (event) => {

        event.preventDefault(); // למנוע מעבר לקישור

        let cart = JSON.parse(localStorage.getItem("cart") || "[]");//לוקח את העגלה מה- localStorage

        const index = cart.findIndex(p => p.id === product.id);// מחפש אם המוצר כבר בעגלה לפי בחירת ה-id

        if (index !== -1) {
          cart[index].count += 1; // עדכון כמות
        }
        else {
          const newProduct = { ...product, count: 1 };//אם מוצר לא קיים בעגלה אז נוסיף אותו עם כמות של 1
          cart.push(newProduct); // הוספה
        }

        localStorage.setItem("cart", JSON.stringify(cart));//שומר את  העגלה ב- localStorage

        cartBtn.classList.add("active"); //הוספת קלאס לשינוי צבע 
        shopBadge.textContent = cart.length; //עדכון מספר הפריטים בעגלה
        faShopping.classList.add("active"); //הוספת קלאס לעגלת קניות

      });



      const fastBuyLink = document.createElement("a");
      fastBuyLink.href = "#";

      const fastBuyBtn = document.createElement("button");
      fastBuyBtn.classList.add("fest-buy");
      fastBuyBtn.innerHTML = "קנייה מהירה";
      fastBuyLink.appendChild(fastBuyBtn);

      cartDiv.appendChild(cartLink);
      cartDiv.appendChild(fastBuyLink);
      itemDiv.appendChild(cartDiv);


      recommendContainer.appendChild(itemDiv);
    });
    console.log(recommendProducts);

    //לבדוק האם הם עובדים
    console.log("recommendContainer:", recommendContainer);
    console.log("recommendProducts:", recommendProducts);

  })
  .catch(err => console.error("שגיאה בטעינת המוצרים:", err));
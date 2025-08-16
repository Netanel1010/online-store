//אייקון של עגלת קניות 
const cart2 = document.querySelector('.cart');

const faShopping2 = cart2.querySelectorAll('a')[2]; // לוקח את הקישור השלישי ב-cart
const shopBadge2 = document.querySelector('.badge');

const faHeart2 = cart2.querySelectorAll('a')[1]; // לוקח את הקישור השני ב-cart
const favBadge2 = document.querySelector('.badge-1');

const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get("id");

fetch("products.json")
  .then(res => res.json())
  .then(products => {

    const product = products.find(p => p.id === productId);
    if (!product) {
      document.body.innerHTML = "<h2>המוצר לא זמין</h2>";
      return;
    }

    //id=product-page
    const container = document.querySelector("#product-page");

    //product-name-top
    const nameTop = document.createElement("div");
    nameTop.classList.add("product-name-top");
    nameTop.innerHTML = `<h3>${product.fullName || "Product Page"}</h3>`;
    container.appendChild(nameTop);

    //product-center
    const productCenter = document.createElement("div");
    productCenter.classList.add("product-center");

    //  תמונה ראשית //product-img
    const imgContainer = document.createElement("div");
    imgContainer.classList.add("product-img");

    const mainImgDiv = document.createElement("div");
    mainImgDiv.classList.add("product-main-img");

    const a = document.createElement("a");
    a.href = "#";
    const img = document.createElement("img");
    img.src = product.mainImage;
    a.appendChild(img);
    mainImgDiv.appendChild(a);

    const zoomBtn = document.createElement("button");
    const zoomIcon = document.createElement("i");
    zoomIcon.classList.add('fa-solid', 'fa-magnifying-glass-plus');
    zoomBtn.appendChild(zoomIcon);
    mainImgDiv.appendChild(zoomBtn);

    if (product.priceOld) {
      const saleBtn = document.createElement("button");
      saleBtn.classList.add("sale-month");
      saleBtn.innerHTML = "<span>מבצע החודש</span>";
      mainImgDiv.appendChild(saleBtn);
    }
    imgContainer.appendChild(mainImgDiv);

    // תמונות קטנות 
    const smallImgs = document.createElement("div");
    smallImgs.classList.add("product-small-img");

    product.gallery.forEach(imageObj => {
      if (!imageObj || !imageObj.small || !imageObj.large) return; // בדיקה אם התמונה קיימת

      const btn = document.createElement("button");
      const img = document.createElement("img");
      img.src = imageObj.small; // תמונה קטנה

      img.onerror = () => {
        btn.style.display = "none"; // הסתרת הכפתור אם התמונה לא נטענת
      };

      btn.appendChild(img);
      smallImgs.appendChild(btn);

      // אפשרות: כשאני לוחץ על תמונה קטנה -> משנים את הראשית
      btn.addEventListener("click", () => {
        a.querySelector("img").src = imageObj.large; // תמונה גדולה
      });
    });

    imgContainer.appendChild(smallImgs);
    productCenter.appendChild(imgContainer);

    // מידע על המוצר //product-data
    const dataDiv = document.createElement("div");
    dataDiv.classList.add("product-data");

    // top
    const topDiv = document.createElement("div");
    topDiv.classList.add("top");
    const brandLink = document.createElement("a");
    brandLink.href = product.link;
    const brandImg = document.createElement("img");
    brandImg.src = product.brandPage;
    brandLink.appendChild(brandImg);
    topDiv.appendChild(brandLink);

    const sku = document.createElement("div");
    sku.classList.add("sku");
    sku.innerHTML = `<span class="name">מק"ט: </span><span class="num">${product.id}</span>`;
    topDiv.appendChild(sku);
    dataDiv.appendChild(topDiv);

    //product-name
    const nameDiv = document.createElement("div");
    nameDiv.classList.add("product-name");
    nameDiv.innerHTML = `<h3>${product.fullName}</h3>`;
    dataDiv.appendChild(nameDiv);

    //warranty
    const warranty = document.createElement("div");
    warranty.classList.add("warranty");
    warranty.innerHTML = `<span class="name">אחריות: </span><span class="num">${product.warranty}</span>`;

    const warrantyHr = document.createElement('hr');

    dataDiv.appendChild(warranty);
    dataDiv.appendChild(warrantyHr);

    //product-price
    const priceDiv = document.createElement("div");
    priceDiv.classList.add("product-price");

    // יצירת בלוק מחיר רגיל
    const price = document.createElement("div");
    price.classList.add("price");

    const nameSpan1 = document.createElement("span");
    nameSpan1.classList.add("name");
    nameSpan1.textContent = "מחיר: ";

    const oldNew1 = document.createElement("div");
    oldNew1.classList.add("old-new");

    // מחיר ישן (רק אם קיים)
    if (product.priceOld) {
      const oldPrice = document.createElement("span");
      oldPrice.classList.add("old");
      oldPrice.textContent = `₪${product.priceOld}`;
      oldNew1.appendChild(oldPrice);
    }

    // מחיר חדש
    const newPrice = document.createElement("span");
    newPrice.classList.add("new");
    newPrice.textContent = `₪${product.priceNew}`;
    oldNew1.appendChild(newPrice);

    price.appendChild(nameSpan1);
    price.appendChild(oldNew1);

    // בלוק מחיר אילת (רק אם קיים)
    if (product.priceEilat) {
      const eilat = document.createElement("div");
      eilat.classList.add("eilat");

      const nameSpan2 = document.createElement("span");
      nameSpan2.classList.add("name");
      nameSpan2.textContent = "מחיר באילת: ";

      const oldNew2 = document.createElement("div");
      oldNew2.classList.add("old-new");

      const eilatPrice = document.createElement("span");
      eilatPrice.classList.add("new");
      eilatPrice.textContent = `₪${product.priceEilat}`;

      oldNew2.appendChild(eilatPrice);
      eilat.appendChild(nameSpan2);
      eilat.appendChild(oldNew2);

      priceDiv.appendChild(price);
      priceDiv.appendChild(eilat);
    } else {
      priceDiv.appendChild(price);
    }

    // הוספת קו מפריד
    const priceHr = document.createElement('hr');
    dataDiv.appendChild(priceDiv);
    dataDiv.appendChild(priceHr);

    productCenter.appendChild(dataDiv);


    // כפתור הוספה למועדפים 
    // יצירת האלמנט הראשי
    //product-order
    const divOrder = document.createElement('div');
    divOrder.classList.add('product-order');

    // כיתוב התשלומים
    const p = document.createElement('p');
    p.textContent = 'עד 12 תשלומים ללא ריבית';
    divOrder.appendChild(p);

    // עטיפת כל ההזמנה
    const allOrder = document.createElement('div');
    allOrder.classList.add('all-order');

    // שלישיית האופציות
    const threeOrder = document.createElement('div')
    threeOrder.classList.add('three-order')

    // שתי כפתורי הקנייה
    const twoOrder = document.createElement('div');
    twoOrder.classList.add('two-order');

    // כפתור עגלה
    const cartBtn = document.createElement('button');
    cartBtn.classList.add('cart');
    const cartIcon = document.createElement('i');
    cartIcon.classList.add('fa', 'fa-shopping-cart');
    cartIcon.title = "הוסף לעגלה";
    cartBtn.appendChild(cartIcon);

    const cartData = JSON.parse(localStorage.getItem("cart") || "[]");
    const isInCart = cartData.some(p => p.id === product.id);
    if (isInCart) {
      cartBtn.classList.add("active"); // אם המוצר בעגלה, הוסף את הקלאס active
    }

    // כפתור קנייה מהירה
    const fastBuyBtn = document.createElement('button');
    fastBuyBtn.classList.add('fest-buy');
    fastBuyBtn.textContent = 'קנייה מהירה';

    twoOrder.appendChild(cartBtn);
    twoOrder.appendChild(fastBuyBtn);

    // יצירת ספירת פריטים
    const countLink = document.createElement('a');
    countLink.href = "#";

    const countDiv = document.createElement('div');
    countDiv.classList.add('count');

    // כפתור פלוס
    const plusBtn = document.createElement('button');
    plusBtn.classList.add('plus');
    plusBtn.textContent = '+';

    // קלט מספר
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '1';
    label.appendChild(input);

    // כפתור מינוס
    const minusBtn = document.createElement('button');
    minusBtn.classList.add('minus');
    minusBtn.textContent = '-';

    countDiv.appendChild(plusBtn);
    countDiv.appendChild(label);
    countDiv.appendChild(minusBtn);
    countLink.appendChild(countDiv);

    //הכנסת הכול לשלישייה
    threeOrder.appendChild(twoOrder);
    threeOrder.appendChild(countLink);

    // כפתור לב
    const heartBtn = document.createElement('button');
    heartBtn.classList.add('heart');
    const heartIcon = document.createElement('i');
    heartIcon.classList.add('fa-solid', 'fa-heart');
    heartIcon.title = "הוסף למועדפים";
    heartBtn.appendChild(heartIcon);

    const favoritesData = JSON.parse(localStorage.getItem("favorites") || "[]");
    const isInFavorites = favoritesData.some(p => p.id === product.id);
    if (isInFavorites) {
      heartBtn.classList.add("active"); // אם המוצר במועדפים, הוסף את הקלאס active
    }

    //הכנסת לשלד הכללי
    allOrder.appendChild(threeOrder);
    allOrder.appendChild(heartBtn);
    divOrder.appendChild(allOrder);

    //קו מפריד
    const hr = document.createElement('hr');

    //הוספה לדף
    // הוספה לדף
    dataDiv.appendChild(divOrder);
    dataDiv.appendChild(hr);




    //מועדפים
    heartBtn.addEventListener("click", () => {
      let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
      const index = favorites.findIndex(p => p.id === product.id);

      if (index !== -1) {
        favorites.splice(index, 1); // הסרה
        heartBtn.classList.remove("active");
      } else {
        favorites.push(product); // הוספה
        heartBtn.classList.add("active");
      }
      localStorage.setItem("favorites", JSON.stringify(favorites));

      if (favorites.length > 0) {
        faHeart2.classList.add("active");
        favBadge2.textContent = favorites.length; // עדכון מספר הפריטים במועדפים
      }
      else {
        faHeart2.classList.remove("active");
        favBadge2.textContent = 0; // אם אין פריטים במועדפים, ננקה את הספירה
      }

    });



    //עגלה
    cartBtn.addEventListener("click", (event) => {
      
      event.preventDefault(); // למנוע מעבר לקישור

      let cart = JSON.parse(localStorage.getItem("cart") || "[]");
      const index = cart.findIndex(p => p.id === product.id);
      if (index !== -1) {
        cart[index].count += 1; // עדכון כמות
      } else {
        const newProduct = { ...product, count: 1 };
        cart.push(newProduct); // הוספה
        
      }
      
      localStorage.setItem("cart", JSON.stringify(cart));

      cartBtn.classList.add("active"); 

      shopBadge2.textContent = cart.length; // עדכון מספר הפריטים בעגלה
      faShopping2.classList.add("active"); // הוספת קלאס לעגלת קניות
    });




    //supply //אספקה
    const supplyDiv = document.createElement('div');
    supplyDiv.classList.add('supply');

    const supplySpan = document.createElement('span');
    supplySpan.textContent = 'אספקה: ';
    supplyDiv.appendChild(supplySpan);

    const supplyP1 = document.createElement('p');
    supplyP1.textContent = "איסוף עצמי מהסניפים - ללא עלות.";
    supplyDiv.appendChild(supplyP1);

    const supplyP2 = document.createElement('p');
    supplyP2.textContent = "איסוף עצמי מנקודת איסוף - ללא עלות.";
    supplyDiv.appendChild(supplyP2);

    const supplyP3 = document.createElement('p');
    supplyP3.textContent = "שליח עד הבית - 45 ₪ , בהזמנות מעל 2,000 ₪ - ללא עלות.";
    supplyDiv.appendChild(supplyP3);


    dataDiv.appendChild(supplyDiv);


    // תיאור 
    const descTitle = document.createElement("div");
    descTitle.classList.add("product-description-name");
    descTitle.innerHTML = "<h2>תיאור</h2>";
    productCenter.appendChild(descTitle);

    const desc = document.createElement("div");
    desc.classList.add("product-description");
    const ul = document.createElement("ul");
    product.features.forEach(f => {
      const li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });
    desc.innerHTML = "<h3>KEY FEATURE</h3>";
    desc.appendChild(ul);
    productCenter.appendChild(desc);

    // מפרט 
    const specTitle = document.createElement("div");
    specTitle.classList.add("product-attributes-name");
    specTitle.innerHTML = "<h2>מפרט</h2>";
    productCenter.appendChild(specTitle);

    const specs = document.createElement("div");
    specs.classList.add("product-attributes");
    for (const key in product.attributes) {
      const item = document.createElement("div");
      item.classList.add("item");

      const q = document.createElement("span");
      q.classList.add("question");
      q.textContent = key;

      const a = document.createElement("span");
      a.classList.add("answer");
      a.textContent = product.attributes[key];

      item.appendChild(q);
      item.appendChild(a);
      specs.appendChild(item);
    }

    productCenter.appendChild(specs);

    container.appendChild(productCenter);
  })
  .catch(err => console.error("שגיאה בטעינת המוצרים:", err));


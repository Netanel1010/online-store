const header = document.querySelector("header");
const head = document.querySelector("header .head");


//בודק אם נמצא אלמנט ההמבורגר
document.addEventListener("DOMContentLoaded", function() {
  const hamburger = document.querySelector(".hamburger");
  //אם נמצא אלמנט ההמבורגר, מוסיף לו מאזין קליק שמפעיל את הפונקציה
  if (hamburger) {
    hamburger.addEventListener("click", toggleMenu);
  }

   const closeMenuBtn = document.querySelector("#closeMenuBtn");
  //אם נמצא כפתור הסגירה, מוסיף לו מאזין קליק שמסיר את הקלאס active מהתפריט הצדדי (סוגר אותו) וגם מסיר את המאזין ללחיצה מחוץ לתפריט.
  if (closeMenuBtn) {
    closeMenuBtn.addEventListener("click", function() {
      const sideMenu = document.querySelector("#sideMenu");
      if (sideMenu) {
        sideMenu.classList.remove("active");
        document.removeEventListener("mousedown", closeMenuOnClickOutside);
      }
    });
  }
});

//מסיר את הקלאס 'active' מהתפריט הצדדי (סוגר אותו)
function toggleMenu() {
  const sideMenu = document.getElementById("sideMenu");
  if (sideMenu) {
    sideMenu.classList.toggle("active");

    // הוספת מאזין ללחיצה מחוץ לתפריט
    if (sideMenu.classList.contains("active")) {
      document.addEventListener("mousedown", closeMenuOnClickOutside);
    } else {
      document.removeEventListener("mousedown", closeMenuOnClickOutside);
    }
  }
}

//פותח או סוגר את התפריט הצדדי על ידי החלפת הקלאס 'active'
function closeMenuOnClickOutside(event) {
  const sideMenu = document.querySelector("#sideMenu");
  const hamburger = document.querySelector(".hamburger");
  if (
    sideMenu &&
    !sideMenu.contains(event.target) &&
    !hamburger.contains(event.target)
  ) {
    sideMenu.classList.remove("active");
    document.removeEventListener("mousedown", closeMenuOnClickOutside);
  }
}


//חיפוש
const search = document.querySelector(".search");
const input = document.createElement("input");
input.type = "text";
input.placeholder = "חפש מוצרים...";
search.appendChild(input);

//מבצע בקשת נתונים מהמוצרים ומטפל בתוצאות החיפוש
fetch('products.json')
  .then(response => response.json())
  .then(data=>{
    document.querySelector(".search input")?.addEventListener('input' , function(event){
      const value = event.target.value;
      const result = document.querySelector('#search-result');
      result.innerHTML='';
      result.style.display = 'none';

      if(value.length < 2){
        result.style.display = 'none';
        return;
      }

      let filteredItem = data.filter(product => product.name.toLowerCase().includes(value.toLowerCase()));

      filteredItem = filteredItem.slice(0, 5); 

      if(filteredItem < 1){
      result.style.display = 'none'; 
      return; 
      }
      result.style.display = 'block';
      const ul = document.createElement('ul');
              ul.classList.add('list-group');
      filteredItem.forEach(product =>{
        const li = document.createElement('li');
              li.classList.add('list-group-item');
        const link = document.createElement('a');
              link.href = `product page.html?id=${product.id}`;
        const span = document.createElement('span');
        span.classList.add('name');
        span.innerText = product.name;
        const image = document.createElement('img');
              image.src = product.image;
              image.classList.add('image');
        link.append(span);     
        link.append(image);
        li.append(link);
        ul.append(li);
        result.append(ul);
      })
      console.log(filteredItem);
    })
  })
  .catch(error => console.error(error));



  
//הוספת מס פריטים בעגלה
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
      imgLink.ariaLabel = "";

      const img = document.createElement("img");
      img.src = product.image;
      img.alt = "תמונה של המוצר";
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
    //console.log(saleProducts);

    //לבדוק האם הם עובדים
    //console.log("saleContainer:", saleContainer);
    //console.log("saleProducts:", saleProducts);

  })
  .catch(err => console.error("שגיאה בטעינת המוצרים:", err));




//מומלצים
fetch('products.json')
  .then(res => res.json())
  .then(data => {

    const recommendContainer = document.querySelector('.recommend');
    const recommendNone = document.querySelector('#recommendNone');

    if(!recommendContainer||!recommendNone){return;}


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
    //console.log(recommendProducts);

    //לבדוק האם הם עובדים
    //console.log("recommendContainer:", recommendContainer);
    //console.log("recommendProducts:", recommendProducts);

  })
  .catch(err => console.error("שגיאה בטעינת המוצרים:", err));


//גלילה למעלה
document.addEventListener("DOMContentLoaded", function(){
  //גלילה חלקה למעלה
  document.querySelector('.back-to-top')?.addEventListener('click' , function(event){
    event.preventDefault();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    })

  })
  //גלילה בהתאם למסך
  document.addEventListener('scroll' , function(){

    const {scrollTop , clientHeight}=document.documentElement;

    /*const scrollTop = document.documentElement.scrollTop;
    const screnSize = document.documentElement.clientHeight;*/

    if( scrollTop > ( clientHeight / 2 ) ){
        document.querySelector('.back-to-top').classList.add('active');
    } else {
        document.querySelector('.back-to-top').classList.remove('active');
    }

  })
});



//תמונות מתחלפות
const sliderImg = document.querySelectorAll('.slider');
let currentSlide = 0;
let autoSlide; 

//אחורה
document.querySelector('.prev')?.addEventListener('click' ,  function(){
  
  if(currentSlide > 0){
    sliderImg[currentSlide].classList.remove('is-active');
    sliderImg[currentSlide-1].classList.add('is-active');
    currentSlide--;
  } else{
    sliderImg[currentSlide].classList.remove('is-active');
    sliderImg[sliderImg.length-1].classList.add('is-active');
    currentSlide = sliderImg.length-1;
  }
   resetAutoSlide();
});
 
//קדימה
document.querySelector('.next')?.addEventListener('click' , function(){
  
  if(currentSlide === sliderImg.length-1){
    sliderImg[currentSlide].classList.remove('is-active');
    sliderImg[0].classList.add('is-active');
    currentSlide = 0;
  }else{
    sliderImg[currentSlide].classList.remove('is-active');
    sliderImg[currentSlide+1].classList.add('is-active');
    currentSlide++;
  }
   resetAutoSlide();
});

//לחיצה על המספרים משנה את התמונה
function createDots(){

  const dotsDiv = document.querySelector('.dots');
  if(!dotsDiv) return ;

  sliderImg.forEach(function(item , index){
    
    //create button
    const buttonDot = document.createElement('button');
    buttonDot.classList.add('dot');
    buttonDot.innerHTML = `<i class="fa-regular fa-circle"></i>`;

    buttonDot.addEventListener('click' , function(){

      //נעלים את כול תמונות
      sliderImg.forEach(function(item){
        item.classList.remove('is-active'); 
      })

      document.querySelectorAll('.dot i').forEach(dot => {
        dot.classList.remove('active-dot');
      });

      //נציג את התמונה במקום שבחרתי
      currentSlide = index;
      sliderImg[index].classList.add('is-active');

      buttonDotI.classList.add('active-dot');

       resetAutoSlide();
    })
    dotsDiv.append(buttonDot);
  })

  const imageMain = document.querySelector('.imageMain');
  if(imageMain && !imageMain.contains(dotsDiv)){
    imageMain.append(dotsDiv);
  }

}
createDots();


//מעבר אוטומטי 
function startAutoSlide(){
  // יוצרים אינטרוול שירוץ כל 4000 מילישניות (4 שניות)
  autoSlide = setInterval(function(){

    // קודם מסירים את המחלקה 'is-active' מכל התמונות
    sliderImg.forEach(item => item.classList.remove('is-active'));

    // מסירים גם את ההדגשה 'active-dot' מכל הנקודות
    document.querySelectorAll('.dot i').forEach(dot => dot.classList.remove('active-dot'));

    // מעדכנים את currentSlide ל-slide הבא
    // % sliderImg.length = אם הגענו לסוף, חוזרים להתחלה
    currentSlide = (currentSlide + 1) % sliderImg.length;

    // מוסיפים את המחלקה 'is-active' לתמונה הנוכחית
    sliderImg[currentSlide].classList.add('is-active');

    // מוסיפים הדגשה ל-dot שמתאים לתמונה הנוכחית
    document.querySelectorAll('.dot i')[currentSlide].classList.add('active-dot');

  }, 4000); // סוף setInterval – כל 4 שניות
}
startAutoSlide();

function resetAutoSlide(){
  clearInterval(autoSlide);
  startAutoSlide();
}

// עצירה כשמעבירים עכבר על התמונה
const imageMain = document.querySelector('.imageMain');
if(imageMain){
  imageMain.addEventListener('mouseenter', () => {
    clearInterval(autoSlide); // עוצרים
  });

  imageMain.addEventListener('mouseleave', () => {
    startAutoSlide(); // ממשיכים שוב
  });
}
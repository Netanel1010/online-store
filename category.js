// שלב 1: קבל את שם הקטגוריה מה-URL
const urlParams = new URLSearchParams(window.location.search);
const categoryParam = urlParams.get('category');

// עדכן את כותרת הדף
const categoryName = document.querySelector(".categoryName");
const categoryNameH1 = document.createElement('h1');
categoryNameH1.textContent = `Category. ${categoryParam}`
categoryName.appendChild(categoryNameH1);



//מיין לפי
function onSort (type , product){

    if(type == 'Recommend'){
        return product.sort(function(a,b){
            return b.Recommend - a.Recommend
        })
    }
    if(type == 'price_low_high'){
        return  product.sort(function(a,b){
            return a.priceNew - b.priceNew
        })
    }
    if(type == 'price_high_low'){
        return product.sort(function(a,b){
            return b.priceNew-a.priceNew
        })
    }
    return product;//אם לא בחרתי כלום
}


fetch('products.json')          //שולח בקשה לקובץ הזה
    .then(res => res.json())          //מתי שנקבל תשובה נמיר את ג'ייסון לאובייקטים של ג'אווהקריפט
    .then(data => {                   //המערך של כול המוצרים

        const filtered = data.filter(product => product.category === categoryParam);

        const container = document.querySelector(".items");

        const cartData = JSON.parse(localStorage.getItem("cart") || "[]"); // לוקח את העגלה מה- localStorage


        
        renderProducts(filtered, container, cartData);//שומר על כול הדף הדינמי

        document.querySelector('.sort-model')?.addEventListener('change',function(event){
            console.log(event.target.value);  
          
            let sortedArray = onSort(event.target.value , [...filtered]);
            renderProducts(sortedArray, container, cartData);
            console.log(sortedArray);
          
        })



        if (filtered.length === 0) {
            container.innerHTML = "<p>אין מוצרים בקטגוריה זו.</p>";
        } 
        else {

            filtered.forEach(product => {

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

                if (product.priceOld) {       //אם יש מחיר נציג אותו
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

                const isInCart = cartData.some(p => p.id === product.id); // בודק אם המוצר כבר בעגלה
                if (isInCart) {
                    cartBtn.classList.add("active"); // אם המוצר בעגלה, הוסף קלאס אקטיב
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


                container.appendChild(itemDiv);
                container.style.width = '100%';
            });
        }    
        console.log(data);
    })
    .catch(function (error) {
        return console.error("שגיאה בטעינת המוצרים:", error);
    });





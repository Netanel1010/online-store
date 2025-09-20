function onSort (type , product){

    /*if(type == 'Recommend'){
        return product.sort(function(a,b){
            return b.Recommend - a.Recommend
        })
    }*/
     if(type == 'price_low_high'){
        return  product.sort(function(a,b){
            return a.priceNew - b.priceNew
        })
    }
    else if(type == 'price_high_low'){
        return product.sort(function(a,b){
            return b.priceNew-a.priceNew
        })
    }
    return product;//אם לא בחרתי כלום
}

fetch('products.json')          
    .then(res => res.json())         
    .then(data => {                  
        
        const container = document.querySelector(".items");

        const cartData = JSON.parse(localStorage.getItem("cart") || "[]"); // לוקח את העגלה מה- localStorage

         document.querySelector('.sort-model')?.addEventListener('change',function(event){
            let type = event.target.value;
            const sortedProducts = onSort(type, [...data]);
            container.innerHTML = ""; //נקה את התוכן הקודם
            sortedProducts.forEach(product => {
                 createNewProducts(product, container, cartData);
            });
        })

        data.forEach(product => {
            createNewProducts(product, container, cartData);
        });
    })
    .catch(function (error) {
        return console.error("שגיאה בטעינת המוצרים:", error);
    })

function createNewProducts (product, container, cartData) {
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
}


//סינון קטגוריות
//ניסיון ראשון
/*const checkbox = document.querySelectorAll('#myCheck');
const sortRow = document.querySelector('.sort-row');
checkbox.forEach(function(check){

    check.addEventListener('change' , function(event){

        fetch('products.json')
        .then(response =>response.json())
        .then(data =>{

            const container = document.querySelector(".items");
            const cartData = JSON.parse(localStorage.getItem("cart") || "[]"); // לוקח את העגלה מה- localStorage

            if(check.checked){

                container.innerHTML = ''; 

                const filter = data.filter(product => product.company === check.value);
                console.log(filter);

                //מחזיר מערך של כול המוצרים שבחרתי
                filter.forEach(product =>{
                    createNewProducts(product, container, cartData);
                });
                    
                
            } else{
                //אם לא בחרנו כלום
                container.innerHTML = ''; 
                data.forEach(product => {
                    createNewProducts(product, container, cartData);
                });
            }

        })
        .catch(err =>console.error(err))
        
    })
});*/



document.addEventListener( "DOMContentLoaded" , () =>{
    const checkbox = document.querySelectorAll('#myCheck'); 
    const sortRow = document.querySelector('.sort-row');
    const container = document.querySelector('.items');
    let filterArr = [];

    fetch('products.json')
        .then(response => response.json())
        .then(data => {
            filterArr = data; 

            renderProducts(filterArr , container);
        })
        .catch(error => {  return console.error("שגיאה בטעינת המוצרים:", error); })

    function renderProducts(products , container){
        container.innerHTML = '';


        const cartData = JSON.parse(localStorage.getItem("cart") || "[]");

        products.forEach(product => {
            createNewProducts(product, container, cartData);
        });

    }
    //הסינון
    checkbox.forEach(check =>{
        check.addEventListener('change' , () =>{

            const selectSort = Array.from(checkbox)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);

            if(selectSort.length > 0){
                const filtered = filterArr.filter(product => selectSort.includes(product.company));
                renderProducts(filtered , container);
            } 
            else{
                renderProducts(filterArr , container);
            }
        });
    });
});

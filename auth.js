//localStorage
//fetch

fetch('login.json')
.then(res => res.json())
.then(data =>{  
    

    const email = document.querySelector('.email');
    const password = document.querySelector('.psw'); 
    let userIcon = document.querySelector('.fa-user');
    const button = document.querySelector('.submit');
   
    

    button.addEventListener('click' , (event)=>{

        const loginSubmit = data.filter(user => user.email===email.value && user.password===password.value);

        event.preventDefault();

        if(loginSubmit != -1){
            const login = document.querySelector('.login');
            login.innerHTML = '';
             
            userIcon.style.color = "#00ff00";

            let connect = document.createElement('div');
            connect.classList.add('connect');
            let text = document.createElement('h2');
            text.innerText = `${loginSubmit[0].firstName} ${loginSubmit[0].lastName} is connect!`;
            connect.append(text);
            login.append(connect);  
             
        }else{
            console.log('email or password is not correct')
        }

    });
})
.catch(error => console.error(error))
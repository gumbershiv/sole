public with sharing class WebCartHandler {

    public static void setCartNameFromPersona(List<WebCart> carts){

        String persona = B2BUtil.getPersona();

        // If persona not available, do nothing
        if(String.isBlank(persona)){
            return;
        }

        String expectedName = 'Cart ' + persona;

        for(WebCart cart : carts){

            // Avoid overwriting correct names
            if(String.isBlank(cart.Name) || !cart.Name.contains(persona)){

                cart.Name = expectedName;

            }
        }
    }
}
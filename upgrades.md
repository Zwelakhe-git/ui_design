* make elements be adjusted in size by mouse drag
* add border, outline settings (color, size, style)
* width, height and position panels should be adjusted by mouse wheel.
* add highlighting elements by mouse for multiple selection, which will allow shifting together (changing position). highlighted elements can have the option of being added to a container width a horizontal or vertical or grid layout.
* for a layout container add the possibility of inserting elements. if an element is hovered and placed (dropped, mouse release) over a layout container it will be placed into that container. if the layout container is hovered over certain elements, those elements will be inserted into the container.

* elements inside a container can be dragged out of the bounds of the container. if they are released outside the bounds then they exit the container and are no longer inside it
* a container can have the function of an automatic height and width, fitting the content inside it.
* elements can be given ids, otherwise the id attribute just wont be added if the field is left empty. the id field is not visible on multiple selection.
* the viewport (display) can be adjusted (w x h), and there can by a selection of common displays (iphone 16pro, desktop, ...). dont put a lot.

* an element can be send backward or brought forwad (for z-index adjustment)
* Ctrl + mouse drag makes a duplicate, which is immediately dragged. Ctrl + D just makes the duplicate in the same position, above (z-index >) the original
* an element can be given a shadow
* a container can be scrollable. with this it will have a hidden overflow in case an element inside it is partially visible (overlaps). overflow can be changed between visible, hidden, overflow, overflow-x, overflow-y.
* fix the "vertical" direction. it currently doesnt work
* make the different sections in the right panel collapsable and expandable. like "apearance", "size & position", "layout", "shadow" and so on. the chevron triggers the collapse. right now its there but its not responsive.